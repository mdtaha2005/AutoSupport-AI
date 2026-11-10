import { AvailabilityStatus, Prisma, UserRole } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { logger } from '../../config/logger.js';
import { queueManager } from '../queues/queue.manager.js';
import {
  UpdateAgentProfileInput,
  UpdateAvailabilityInput,
  AgentFilterInput,
} from './agent.validation.js';
import { UserPayload } from '../../types/index.js';
import { ForbiddenError, NotFoundError, BadRequestError } from '../../errors/error-types.js';

export class AgentService {
  async listAgents(filters: AgentFilterInput) {
    const { departmentId, availabilityStatus, skill, page, limit } = filters;
    const skip = (page - 1) * limit;

    const where: Prisma.AgentProfileWhereInput = {
      ...(departmentId && { departmentId }),
      ...(availabilityStatus && { availabilityStatus }),
      ...(skill && {
        skills: {
          has: skill,
        },
      }),
      user: {
        isActive: true,
      },
    };

    const [total, agents] = await Promise.all([
      prisma.agentProfile.count({ where }),
      prisma.agentProfile.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              isActive: true,
            },
          },
          department: {
            select: {
              id: true,
              name: true,
              isActive: true,
            },
          },
        },
        orderBy: [{ availabilityStatus: 'asc' }, { currentWorkload: 'asc' }],
      }),
    ]);

    const enrichedAgents = agents.map((agent) => ({
      ...agent,
      capacityAvailable: Math.max(0, agent.maxWorkload - agent.currentWorkload),
      workloadPercentage:
        agent.maxWorkload > 0
          ? Math.round((agent.currentWorkload / agent.maxWorkload) * 100)
          : 100,
    }));

    return {
      data: enrichedAgents,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getAgentById(id: string) {
    // Look up by agentProfile.id OR userId
    const agent = await prisma.agentProfile.findFirst({
      where: {
        OR: [{ id }, { userId: id }],
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
            createdAt: true,
          },
        },
        department: true,
      },
    });

    if (!agent) {
      throw new NotFoundError(`Agent profile with ID '${id}' not found`);
    }

    const activeTickets = await prisma.ticket.findMany({
      where: {
        assignedAgentId: agent.userId,
        status: { in: ['OPEN', 'IN_PROGRESS', 'PENDING_CUSTOMER'] },
      },
      select: {
        id: true,
        ticketNumber: true,
        title: true,
        priority: true,
        status: true,
        createdAt: true,
      },
      orderBy: { priority: 'desc' },
    });

    return {
      ...agent,
      capacityAvailable: Math.max(0, agent.maxWorkload - agent.currentWorkload),
      workloadPercentage:
        agent.maxWorkload > 0
          ? Math.round((agent.currentWorkload / agent.maxWorkload) * 100)
          : 100,
      activeTickets,
    };
  }

  async updateProfile(id: string, input: UpdateAgentProfileInput, requestingUser: UserPayload) {
    const agent = await prisma.agentProfile.findFirst({
      where: { OR: [{ id }, { userId: id }] },
      include: { department: true },
    });

    if (!agent) {
      throw new NotFoundError(`Agent profile with ID '${id}' not found`);
    }

    // Role check: Only ADMIN and MANAGER can modify agent skills/maxWorkload/department
    if (requestingUser.role !== UserRole.ADMIN && requestingUser.role !== UserRole.MANAGER) {
      throw new ForbiddenError('Only admins and managers can update agent profiles');
    }

    if (input.departmentId) {
      const dept = await prisma.department.findUnique({
        where: { id: input.departmentId },
      });
      if (!dept) {
        throw new BadRequestError('Specified department does not exist');
      }
    }

    return prisma.agentProfile.update({
      where: { id: agent.id },
      data: {
        ...(input.departmentId !== undefined && { departmentId: input.departmentId }),
        ...(input.skills !== undefined && { skills: input.skills }),
        ...(input.maxWorkload !== undefined && { maxWorkload: input.maxWorkload }),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        department: true,
      },
    });
  }

  async updateAvailability(
    id: string,
    input: UpdateAvailabilityInput,
    requestingUser: UserPayload
  ) {
    const agent = await prisma.agentProfile.findFirst({
      where: { OR: [{ id }, { userId: id }] },
    });

    if (!agent) {
      throw new NotFoundError(`Agent profile with ID '${id}' not found`);
    }

    // Agents can update their own availability. Admins/Managers can update any agent's availability.
    if (requestingUser.role === UserRole.AGENT && agent.userId !== requestingUser.id) {
      throw new ForbiddenError('Agents can only update their own availability status');
    }

    const updated = await prisma.agentProfile.update({
      where: { id: agent.id },
      data: {
        availabilityStatus: input.availabilityStatus,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });

    // If agent went OFFLINE, automatically trigger reassignment for their active automated tickets
    if (input.availabilityStatus === AvailabilityStatus.OFFLINE) {
      queueManager.enqueueReassignment(agent.userId, 'Agent changed availability status to OFFLINE').catch((err) => {
        logger.warn(`Failed to enqueue reassignment for agent ${agent.userId}: ${(err as Error).message}`);
      });
    }

    return updated;
  }

  async getWorkload(id: string) {
    const agent = await prisma.agentProfile.findFirst({
      where: { OR: [{ id }, { userId: id }] },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!agent) {
      throw new NotFoundError(`Agent profile with ID '${id}' not found`);
    }

    // Recalculate actual active tickets to ensure consistency
    const activeTicketsCount = await prisma.ticket.count({
      where: {
        assignedAgentId: agent.userId,
        status: { in: ['OPEN', 'IN_PROGRESS', 'PENDING_CUSTOMER'] },
      },
    });

    // If cache out of sync, sync it
    if (activeTicketsCount !== agent.currentWorkload) {
      await prisma.agentProfile.update({
        where: { id: agent.id },
        data: { currentWorkload: activeTicketsCount },
      });
    }

    return {
      agentId: agent.id,
      userId: agent.userId,
      agentName: agent.user.name,
      currentWorkload: activeTicketsCount,
      maxWorkload: agent.maxWorkload,
      availabilityStatus: agent.availabilityStatus,
      capacityAvailable: Math.max(0, agent.maxWorkload - activeTicketsCount),
      utilizationPercentage:
        agent.maxWorkload > 0
          ? Math.round((activeTicketsCount / agent.maxWorkload) * 100)
          : 100,
      isOverloaded: activeTicketsCount >= agent.maxWorkload,
    };
  }
}

export const agentService = new AgentService();
