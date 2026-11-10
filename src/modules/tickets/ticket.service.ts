import {
  ActivityAction,
  AssignmentType,
  AvailabilityStatus,
  Prisma,
  RoutingStatus,
  TicketCategory,
  TicketPriority,
  TicketStatus,
  UserRole,
} from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { logger } from '../../config/logger.js';
import {
  CreateTicketInput,
  UpdateTicketInput,
  UpdateStatusInput,
  AssignTicketInput,
  TicketFilterInput,
} from './ticket.validation.js';
import { UserPayload } from '../../types/index.js';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../../errors/error-types.js';
import { nlpService } from '../nlp/nlp.service.js';
import { queueManager } from '../queues/queue.manager.js';
import { assignmentService } from '../routing/assignment.service.js';
import { redisManager } from '../../config/redis.js';

export class TicketService {
  async createTicket(input: CreateTicketInput, requestingUser?: UserPayload) {
    // 1. Validate department if provided
    if (input.departmentId) {
      const dept = await prisma.department.findUnique({
        where: { id: input.departmentId },
      });
      if (!dept || !dept.isActive) {
        throw new BadRequestError('Specified department does not exist or is inactive');
      }
    }

    // 2. Validate assignedAgentId if provided
    let assignedUserId: string | null = null;
    if (input.assignedAgentId) {
      if (
        requestingUser &&
        requestingUser.role !== UserRole.ADMIN &&
        requestingUser.role !== UserRole.MANAGER
      ) {
        throw new ForbiddenError('Only admins and managers can assign agents during ticket creation');
      }

      const agentProfile = await prisma.agentProfile.findFirst({
        where: {
          OR: [{ id: input.assignedAgentId }, { userId: input.assignedAgentId }],
        },
        include: { user: true },
      });

      if (!agentProfile || !agentProfile.user.isActive) {
        throw new BadRequestError('Assigned agent does not exist or is inactive');
      }

      if (agentProfile.availabilityStatus === AvailabilityStatus.OFFLINE) {
        throw new BadRequestError('Cannot assign ticket to an offline agent');
      }

      if (agentProfile.currentWorkload >= agentProfile.maxWorkload) {
        throw new BadRequestError(
          `Agent ${agentProfile.user.name} is at maximum capacity (${agentProfile.currentWorkload}/${agentProfile.maxWorkload})`
        );
      }

      assignedUserId = agentProfile.userId;
    }

    // 3. Resolve customer details
    let customerId: string | null = null;
    let customerName = input.customerName || null;
    let customerEmail = input.customerEmail || null;

    if (requestingUser) {
      if (requestingUser.role === UserRole.CUSTOMER) {
        customerId = requestingUser.id;
        customerName = requestingUser.name;
        customerEmail = requestingUser.email;
      }
    }

    // 4. Create ticket and increment agent workload atomically
    const ticket = await prisma.$transaction(async (tx) => {
      const isManual = assignedUserId !== null;
      const createdTicket = await tx.ticket.create({
        data: {
          title: input.title,
          description: input.description,
          priority: input.priority || TicketPriority.MEDIUM,
          status: TicketStatus.OPEN,
          customerId,
          customerName,
          customerEmail,
          departmentId: input.departmentId || null,
          assignedAgentId: assignedUserId,
          isManuallyAssigned: isManual,
          routingStatus: isManual ? RoutingStatus.ASSIGNED : RoutingStatus.PENDING,
          assignedAt: isManual ? new Date() : null,
        },
        include: {
          department: true,
          assignedAgent: {
            select: { id: true, name: true, email: true, role: true },
          },
          customer: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      // Activity: TICKET_CREATED
      await tx.ticketActivity.create({
        data: {
          ticketId: createdTicket.id,
          actorId: requestingUser?.id || null,
          action: ActivityAction.TICKET_CREATED,
          details: {
            title: createdTicket.title,
            priority: createdTicket.priority,
            department: createdTicket.department?.name || null,
            initialStatus: createdTicket.status,
          },
        },
      });

      // If assigned directly, increment workload, record history & AGENT_ASSIGNED
      if (assignedUserId) {
        await tx.agentProfile.update({
          where: { userId: assignedUserId },
          data: { currentWorkload: { increment: 1 } },
        });

        await tx.ticketAssignmentHistory.create({
          data: {
            ticketId: createdTicket.id,
            previousAgentId: null,
            newAgentId: assignedUserId,
            assignedById: requestingUser?.id || null,
            assignmentType: AssignmentType.MANUAL,
            reason: 'Assigned upon ticket creation',
          },
        });

        await tx.ticketActivity.create({
          data: {
            ticketId: createdTicket.id,
            actorId: requestingUser?.id || null,
            action: ActivityAction.AGENT_ASSIGNED,
            details: {
              assignedTo: assignedUserId,
              agentName: createdTicket.assignedAgent?.name,
            },
          },
        });
      }

      return createdTicket;
    });

    // Auto-trigger NLP analysis for intelligent categorization, sentiment, and priority
    try {
      await nlpService.analyzeTicket(ticket.id, requestingUser?.id);
    } catch {
      // Do not block ticket creation if NLP microservice is temporarily unavailable
    }

    // Auto-dispatch to intelligent routing engine queue if ticket has no agent assigned
    if (!assignedUserId && redisManager.isAvailable()) {
      setImmediate(() => {
        queueManager.enqueueAssignment(ticket.id).catch((routingErr) => {
          logger.warn(`Failed to enqueue routing for ticket ${ticket.id}: ${(routingErr as Error).message}`);
        });
      });
    }

    const enrichedTicket = await prisma.ticket.findUnique({
      where: { id: ticket.id },
      include: {
        department: true,
        assignedAgent: {
          select: { id: true, name: true, email: true, role: true },
        },
        customer: {
          select: { id: true, name: true, email: true },
        },
        nlpAnalysis: true,
        assignmentHistory: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    return enrichedTicket || ticket;
  }

  async listTickets(filters: TicketFilterInput, requestingUser: UserPayload) {
    const {
      status,
      priority,
      category,
      needsHumanReview,
      departmentId,
      assignedAgentId,
      customerId,
      search,
      page,
      limit,
      sortBy,
      sortOrder,
    } = filters;

    const skip = (page - 1) * limit;

    // RBAC query filter enforcement
    const where: Prisma.TicketWhereInput = {};

    if (requestingUser.role === UserRole.CUSTOMER) {
      where.customerId = requestingUser.id;
    } else if (requestingUser.role === UserRole.AGENT) {
      // Agents can only view tickets assigned to them OR in their department
      const agentProfile = await prisma.agentProfile.findUnique({
        where: { userId: requestingUser.id },
      });

      if (!agentProfile) {
        throw new ForbiddenError('Agent profile not found');
      }

      where.OR = [
        { assignedAgentId: requestingUser.id },
        ...(agentProfile.departmentId ? [{ departmentId: agentProfile.departmentId }] : []),
      ];
    }

    // Apply additional filters
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (category) where.category = category;
    if (needsHumanReview !== undefined) where.needsHumanReview = needsHumanReview;
    if (departmentId) where.departmentId = departmentId;
    if (assignedAgentId) where.assignedAgentId = assignedAgentId;
    if (customerId && requestingUser.role !== UserRole.CUSTOMER) where.customerId = customerId;

    if (search) {
      where.AND = [
        {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const [total, tickets] = await Promise.all([
      prisma.ticket.count({ where }),
      prisma.ticket.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          department: { select: { id: true, name: true } },
          assignedAgent: { select: { id: true, name: true, email: true } },
          customer: { select: { id: true, name: true, email: true } },
          nlpAnalysis: true,
          _count: {
            select: {
              comments: true,
              activities: true,
            },
          },
        },
      }),
    ]);

    return {
      data: tickets,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getTicketById(id: string, requestingUser: UserPayload) {
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        department: true,
        assignedAgent: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            agentProfile: {
              select: {
                id: true,
                skills: true,
                availabilityStatus: true,
                currentWorkload: true,
                maxWorkload: true,
              },
            },
          },
        },
        customer: {
          select: { id: true, name: true, email: true },
        },
        comments: {
          include: {
            author: {
              select: { id: true, name: true, email: true, role: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        activities: {
          include: {
            actor: {
              select: { id: true, name: true, email: true, role: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        nlpAnalysis: true,
        assignmentHistory: {
          include: {
            previousAgent: { select: { id: true, name: true, email: true } },
            newAgent: { select: { id: true, name: true, email: true } },
            assignedBy: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!ticket) {
      throw new NotFoundError(`Ticket with ID '${id}' not found`);
    }

    // RBAC Permission Check
    if (requestingUser.role === UserRole.CUSTOMER) {
      if (ticket.customerId !== requestingUser.id) {
        throw new ForbiddenError('You do not have permission to view this ticket');
      }
      // Hide internal comments from customers
      ticket.comments = ticket.comments.filter((c) => !c.isInternal);
    } else if (requestingUser.role === UserRole.AGENT) {
      const agentProfile = await prisma.agentProfile.findUnique({
        where: { userId: requestingUser.id },
      });

      const isAssigned = ticket.assignedAgentId === requestingUser.id;
      const isSameDept = agentProfile?.departmentId && ticket.departmentId === agentProfile.departmentId;

      if (!isAssigned && !isSameDept) {
        throw new ForbiddenError('Agents cannot view tickets outside their assigned department or tickets');
      }
    }

    return ticket;
  }

  async updateTicket(id: string, input: UpdateTicketInput, requestingUser: UserPayload) {
    const ticket = await prisma.ticket.findUnique({
      where: { id },
    });

    if (!ticket) {
      throw new NotFoundError(`Ticket with ID '${id}' not found`);
    }

    // Agent permission check: Agents can only update tickets assigned to them
    if (requestingUser.role === UserRole.AGENT && ticket.assignedAgentId !== requestingUser.id) {
      throw new ForbiddenError('Agents can only update tickets assigned directly to them');
    }

    if (input.departmentId) {
      const dept = await prisma.department.findUnique({
        where: { id: input.departmentId },
      });
      if (!dept || !dept.isActive) {
        throw new BadRequestError('Specified department does not exist or is inactive');
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.ticket.update({
        where: { id },
        data: {
          ...(input.title !== undefined && { title: input.title }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.priority !== undefined && { priority: input.priority }),
          ...(input.departmentId !== undefined && { departmentId: input.departmentId }),
        },
        include: {
          department: true,
          assignedAgent: { select: { id: true, name: true, email: true } },
        },
      });

      const changes: Record<string, any> = {};
      if (input.title && input.title !== ticket.title) changes.title = { from: ticket.title, to: input.title };
      if (input.description && input.description !== ticket.description) changes.description = 'updated';
      if (input.priority && input.priority !== ticket.priority) changes.priority = { from: ticket.priority, to: input.priority };
      if (input.departmentId !== undefined && input.departmentId !== ticket.departmentId) {
        changes.departmentId = { from: ticket.departmentId, to: input.departmentId };
      }

      await tx.ticketActivity.create({
        data: {
          ticketId: id,
          actorId: requestingUser.id,
          action: ActivityAction.TICKET_UPDATED,
          details: changes as Prisma.InputJsonValue,
        },
      });

      return res;
    });

    return updated;
  }

  async updateStatus(id: string, input: UpdateStatusInput, requestingUser: UserPayload) {
    const ticket = await prisma.ticket.findUnique({
      where: { id },
    });

    if (!ticket) {
      throw new NotFoundError(`Ticket with ID '${id}' not found`);
    }

    // RBAC check: Agent can only update status of assigned ticket
    if (requestingUser.role === UserRole.AGENT && ticket.assignedAgentId !== requestingUser.id) {
      throw new ForbiddenError('Agents can only change status of tickets assigned to them');
    }

    if (ticket.status === input.status) {
      return ticket;
    }

    const oldStatus = ticket.status;
    const newStatus = input.status;

    const isActiveStatus = (s: TicketStatus) =>
      s === TicketStatus.OPEN || s === TicketStatus.IN_PROGRESS || s === TicketStatus.PENDING_CUSTOMER;
    const isClosedStatus = (s: TicketStatus) =>
      s === TicketStatus.RESOLVED || s === TicketStatus.CLOSED;

    const wasActive = isActiveStatus(oldStatus);
    const nowClosed = isClosedStatus(newStatus);
    const wasClosed = isClosedStatus(oldStatus);
    const nowActive = isActiveStatus(newStatus);

    return prisma.$transaction(async (tx) => {
      // 1. Update ticket status
      const updatedTicket = await tx.ticket.update({
        where: { id },
        data: {
          status: newStatus,
          resolvedAt: newStatus === TicketStatus.RESOLVED ? new Date() : (nowActive ? null : undefined),
          closedAt: newStatus === TicketStatus.CLOSED ? new Date() : (nowActive ? null : undefined),
        },
        include: {
          department: true,
          assignedAgent: { select: { id: true, name: true, email: true } },
        },
      });

      // 2. Adjust agent workload if assigned
      if (ticket.assignedAgentId) {
        if (wasActive && nowClosed) {
          // Decrement workload
          await tx.agentProfile.updateMany({
            where: { userId: ticket.assignedAgentId, currentWorkload: { gt: 0 } },
            data: { currentWorkload: { decrement: 1 } },
          });
        } else if (wasClosed && nowActive) {
          // Increment workload
          await tx.agentProfile.update({
            where: { userId: ticket.assignedAgentId },
            data: { currentWorkload: { increment: 1 } },
          });
        }
      }

      // 3. Log activity
      await tx.ticketActivity.create({
        data: {
          ticketId: id,
          actorId: requestingUser.id,
          action: ActivityAction.STATUS_UPDATED,
          details: {
            from: oldStatus,
            to: newStatus,
            notes: input.notes || null,
          },
        },
      });

      return updatedTicket;
    });
  }

  async assignTicket(id: string, input: AssignTicketInput, requestingUser: UserPayload) {
    // Only Admin and Manager can manually assign or reassign tickets
    if (requestingUser.role !== UserRole.ADMIN && requestingUser.role !== UserRole.MANAGER) {
      throw new ForbiddenError('Only administrators and managers can assign or reassign tickets');
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id },
    });

    if (!ticket) {
      throw new NotFoundError(`Ticket with ID '${id}' not found`);
    }

    // Lookup new target agent
    const targetAgent = await prisma.agentProfile.findFirst({
      where: {
        OR: [{ id: input.agentId }, { userId: input.agentId }],
      },
      include: {
        user: true,
        department: true,
      },
    });

    if (!targetAgent || !targetAgent.user.isActive) {
      throw new BadRequestError('Target agent does not exist or is inactive');
    }

    if (targetAgent.availabilityStatus === AvailabilityStatus.OFFLINE) {
      throw new BadRequestError(`Agent ${targetAgent.user.name} is currently OFFLINE and cannot be assigned`);
    }

    if (targetAgent.currentWorkload >= targetAgent.maxWorkload) {
      throw new BadRequestError(
        `Agent ${targetAgent.user.name} has reached maximum workload limit (${targetAgent.currentWorkload}/${targetAgent.maxWorkload})`
      );
    }

    const previousAgentId = ticket.assignedAgentId;
    const isReassignment = previousAgentId !== null && previousAgentId !== targetAgent.userId;

    if (previousAgentId === targetAgent.userId) {
      return ticket; // Already assigned to this agent
    }

    const isTicketActive =
      ticket.status === TicketStatus.OPEN ||
      ticket.status === TicketStatus.IN_PROGRESS ||
      ticket.status === TicketStatus.PENDING_CUSTOMER;

    return prisma.$transaction(async (tx) => {
      // 1. If previous agent existed and ticket is active, decrement their workload
      if (previousAgentId && isTicketActive) {
        await tx.agentProfile.updateMany({
          where: { userId: previousAgentId, currentWorkload: { gt: 0 } },
          data: { currentWorkload: { decrement: 1 } },
        });
      }

      // 2. Increment new agent's workload if ticket is active
      if (isTicketActive) {
        await tx.agentProfile.update({
          where: { id: targetAgent.id },
          data: { currentWorkload: { increment: 1 } },
        });
      }

      // 3. Update ticket with new agent, manual assignment flag, and routing status
      const updatedTicket = await tx.ticket.update({
        where: { id },
        data: {
          assignedAgentId: targetAgent.userId,
          departmentId: ticket.departmentId || targetAgent.departmentId || null,
          isManuallyAssigned: true,
          routingStatus: RoutingStatus.ASSIGNED,
          assignedAt: new Date(),
        },
        include: {
          department: true,
          assignedAgent: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      });

      // 4. Record in dedicated assignment history table
      await tx.ticketAssignmentHistory.create({
        data: {
          ticketId: id,
          previousAgentId,
          newAgentId: targetAgent.userId,
          assignedById: requestingUser.id,
          assignmentType: isReassignment ? AssignmentType.REASSIGNMENT : AssignmentType.MANUAL,
          reason: input.reason || (isReassignment ? 'Manual agent reassignment' : 'Manual agent assignment'),
        },
      });

      // 5. Log activity: AGENT_REASSIGNED or AGENT_ASSIGNED
      await tx.ticketActivity.create({
        data: {
          ticketId: id,
          actorId: requestingUser.id,
          action: isReassignment ? ActivityAction.AGENT_REASSIGNED : ActivityAction.AGENT_ASSIGNED,
          details: {
            fromAgentId: previousAgentId,
            toAgentId: targetAgent.userId,
            agentName: targetAgent.user.name,
            reason: input.reason || null,
          },
        },
      });

      return updatedTicket;
    });
  }

  async analyzeTicket(id: string, requestingUser: UserPayload) {
    const ticket = await this.getTicketById(id, requestingUser);
    await nlpService.analyzeTicket(ticket.id, requestingUser.id);
    return this.getTicketById(id, requestingUser);
  }

  async routeTicket(id: string, requestingUser: UserPayload) {
    const ticket = await this.getTicketById(id, requestingUser);
    await assignmentService.routeTicket(ticket.id, {
      actorId: requestingUser.id,
      bypassManualCheck: true,
      assignmentType: AssignmentType.MANUAL,
      reason: 'Manual intelligent routing triggered by user',
    });
    return this.getTicketById(id, requestingUser);
  }
}

export const ticketService = new TicketService();
