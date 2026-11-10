import { ActivityAction, AssignmentType, RoutingStatus, TicketPriority } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { logger } from '../../config/logger.js';
import { assignmentService } from './assignment.service.js';
import { RoutingDecision } from './routing.types.js';

export interface EscalationResult {
  ticketId: string;
  previousPriority: TicketPriority;
  newPriority: TicketPriority;
  escalationLevel: number;
  routingDecision?: RoutingDecision;
}

export class EscalationService {
  /**
   * Performs priority-aware escalation on an unresolved or unassigned ticket.
   */
  async escalateTicket(ticketId: string, reason = 'SLA escalation trigger'): Promise<EscalationResult | null> {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      logger.warn(`Cannot escalate ticket ${ticketId}: ticket not found`);
      return null;
    }

    const previousPriority = ticket.priority;
    let newPriority: TicketPriority = previousPriority;

    if (previousPriority === TicketPriority.LOW) {
      newPriority = TicketPriority.MEDIUM;
    } else if (previousPriority === TicketPriority.MEDIUM) {
      newPriority = TicketPriority.HIGH;
    } else if (previousPriority === TicketPriority.HIGH) {
      newPriority = TicketPriority.URGENT;
    }

    const nextEscalationLevel = ticket.escalationLevel + 1;

    logger.info(
      `Escalating ticket ${ticket.id} (#${ticket.ticketNumber}) from ${previousPriority} to ${newPriority} (Level ${nextEscalationLevel}). Reason: ${reason}`
    );

    await prisma.$transaction(async (tx) => {
      await tx.ticket.update({
        where: { id: ticket.id },
        data: {
          priority: newPriority,
          escalationLevel: nextEscalationLevel,
          escalatedAt: new Date(),
          routingStatus: RoutingStatus.ESCALATED,
        },
      });

      await tx.ticketActivity.create({
        data: {
          ticketId: ticket.id,
          action: ActivityAction.TICKET_ESCALATED,
          details: {
            previousPriority,
            newPriority,
            escalationLevel: nextEscalationLevel,
            reason,
          },
        },
      });
    });

    // Attempt assignment with updated priority if ticket currently has no agent
    let routingDecision: RoutingDecision | undefined;
    if (!ticket.assignedAgentId) {
      routingDecision = await assignmentService.routeTicket(ticket.id, {
        assignmentType: AssignmentType.ESCALATION,
        reason: `Priority escalated to ${newPriority}: ${reason}`,
      });
    }

    return {
      ticketId: ticket.id,
      previousPriority,
      newPriority,
      escalationLevel: nextEscalationLevel,
      routingDecision,
    };
  }
}

export const escalationService = new EscalationService();
