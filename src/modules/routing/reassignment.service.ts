import { AssignmentType, TicketStatus } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { logger } from '../../config/logger.js';
import { assignmentService } from './assignment.service.js';
import { RoutingDecision } from './routing.types.js';

export interface ReassignmentResult {
  agentUserId: string;
  totalActiveTickets: number;
  reassignedCount: number;
  skippedManualCount: number;
  failedCount: number;
  decisions: RoutingDecision[];
}

export class ReassignmentService {
  /**
   * Reassigns active tickets assigned to an agent who transitioned to OFFLINE or exceeded workload.
   */
  async reassignAgentTickets(
    agentUserId: string,
    reason = 'Agent availability changed to OFFLINE',
    forceManualReassignment = false
  ): Promise<ReassignmentResult> {
    const activeTickets = await prisma.ticket.findMany({
      where: {
        assignedAgentId: agentUserId,
        status: {
          in: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS, TicketStatus.PENDING_CUSTOMER],
        },
      },
    });

    logger.info(
      `Initiating automated reassignment for ${activeTickets.length} active tickets of agent ${agentUserId}. Reason: ${reason}`
    );

    const decisions: RoutingDecision[] = [];
    let reassignedCount = 0;
    let skippedManualCount = 0;
    let failedCount = 0;

    for (const ticket of activeTickets) {
      // Respect managerial manual assignments
      if (ticket.isManuallyAssigned && !forceManualReassignment) {
        logger.debug(
          `Skipping automated reassignment for ticket ${ticket.id}: marked as manually assigned by manager.`
        );
        skippedManualCount++;
        continue;
      }

      try {
        const decision = await assignmentService.routeTicket(ticket.id, {
          assignmentType: AssignmentType.REASSIGNMENT,
          reason,
          bypassManualCheck: forceManualReassignment,
        });

        decisions.push(decision);

        if (decision.selectedAgent) {
          reassignedCount++;
        } else {
          failedCount++;
        }
      } catch (error) {
        logger.error(`Error during reassignment of ticket ${ticket.id}: ${(error as Error).message}`);
        failedCount++;
      }
    }

    return {
      agentUserId,
      totalActiveTickets: activeTickets.length,
      reassignedCount,
      skippedManualCount,
      failedCount,
      decisions,
    };
  }
}

export const reassignmentService = new ReassignmentService();
