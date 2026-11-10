import { UserRole } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { UserPayload } from '../../types/index.js';
import { ForbiddenError, NotFoundError } from '../../errors/error-types.js';

export class ActivityService {
  async getActivities(ticketId: string, requestingUser: UserPayload) {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundError(`Ticket with ID '${ticketId}' not found`);
    }

    // Role-based access control
    if (requestingUser.role === UserRole.CUSTOMER) {
      if (ticket.customerId !== requestingUser.id) {
        throw new ForbiddenError('You can only view activity history for your own tickets');
      }
    } else if (requestingUser.role === UserRole.AGENT) {
      const agentProfile = await prisma.agentProfile.findUnique({
        where: { userId: requestingUser.id },
      });

      const isAssigned = ticket.assignedAgentId === requestingUser.id;
      const isSameDept = agentProfile?.departmentId && ticket.departmentId === agentProfile.departmentId;

      if (!isAssigned && !isSameDept) {
        throw new ForbiddenError('Agents cannot view activities for tickets outside their department');
      }
    }

    const activities = await prisma.ticketActivity.findMany({
      where: { ticketId },
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return activities;
  }
}

export const activityService = new ActivityService();
