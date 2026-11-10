import {
  ActivityAction,
  AssignmentType,
  RoutingStatus,
  TicketStatus,
  Prisma,
} from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { logger } from '../../config/logger.js';
import { departmentRouter } from './department-router.js';
import { scoringEngine } from './scoring.engine.js';
import {
  CandidateAgent,
  RoutingDecision,
  RouteTicketOptions,
  TicketContext,
} from './routing.types.js';

export class AssignmentService {
  /**
   * Evaluates, routes, and atomically assigns a ticket to the highest scoring agent.
   */
  async routeTicket(ticketId: string, options: RouteTicketOptions = {}): Promise<RoutingDecision> {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        nlpAnalysis: true,
        department: true,
        assignedAgent: true,
      },
    });

    if (!ticket) {
      logger.error(`Cannot route ticket: ticket with ID '${ticketId}' not found`);
      return {
        ticketId,
        departmentId: null,
        selectedAgent: null,
        scores: null,
        evaluatedCandidatesCount: 0,
        isFallback: false,
        reason: 'Ticket not found',
      };
    }

    // 1. Manual Assignment Protection: Managers' manual assignments must NEVER be overwritten automatically
    if (ticket.isManuallyAssigned && !options.bypassManualCheck) {
      logger.info(
        `Ticket ${ticket.id} (#${ticket.ticketNumber}) was manually assigned by a manager. Skipping automated routing.`
      );
      return {
        ticketId: ticket.id,
        departmentId: ticket.departmentId,
        selectedAgent: null,
        scores: null,
        evaluatedCandidatesCount: 0,
        isFallback: false,
        reason: 'Ticket was manually assigned by manager; automated overwrite forbidden',
      };
    }

    // 2. Department Resolution
    const departmentId = await departmentRouter.resolveDepartment(
      {
        id: ticket.id,
        departmentId: ticket.departmentId,
        category: ticket.category || ticket.nlpAnalysis?.category,
      },
      options.preferredDepartmentId
    );

    // 3. Fetch candidate agents in target department
    const candidateProfiles = await prisma.agentProfile.findMany({
      where: {
        ...(departmentId ? { departmentId } : {}),
        user: { isActive: true },
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, isActive: true },
        },
      },
    });

    const candidates: CandidateAgent[] = candidateProfiles.map((p) => ({
      id: p.id,
      userId: p.userId,
      name: p.user.name,
      email: p.user.email,
      departmentId: p.departmentId,
      skills: p.skills,
      availabilityStatus: p.availabilityStatus,
      maxWorkload: p.maxWorkload,
      currentWorkload: p.currentWorkload,
      updatedAt: p.updatedAt,
    }));

    // 4. Construct Context & Score Candidates
    const context: TicketContext = {
      id: ticket.id,
      category: ticket.category || ticket.nlpAnalysis?.category,
      intent: ticket.nlpAnalysis?.intent,
      priority: ticket.priority,
      departmentId,
      isManuallyAssigned: ticket.isManuallyAssigned,
    };

    const bestCandidate = scoringEngine.selectBestAgent(candidates, context);

    // 5. Case A: No eligible agent found (all offline or at maximum capacity)
    if (!bestCandidate) {
      logger.warn(
        `No eligible agents available in department ${departmentId} for ticket ${ticket.id} (#${ticket.ticketNumber}). Flagging routing status as FAILED.`
      );

      await prisma.$transaction(async (tx) => {
        await tx.ticket.update({
          where: { id: ticket.id },
          data: {
            routingStatus: RoutingStatus.FAILED,
            ...(departmentId && { departmentId }),
          },
        });

        await tx.ticketActivity.create({
          data: {
            ticketId: ticket.id,
            actorId: options.actorId || null,
            action: ActivityAction.ROUTING_FAILED,
            details: {
              departmentId,
              candidatesEvaluated: candidates.length,
              reason: 'No eligible agent with available capacity found',
            } as Prisma.InputJsonValue,
          },
        });
      });

      return {
        ticketId: ticket.id,
        departmentId,
        selectedAgent: null,
        scores: null,
        evaluatedCandidatesCount: candidates.length,
        isFallback: true,
        reason: 'No eligible agent available',
      };
    }

    // 6. Case B: Eligible agent found. Perform atomic assignment inside ACID transaction
    const selectedAgent = bestCandidate.agent;
    const previousAgentId = ticket.assignedAgentId;
    const isTicketActive =
      ticket.status === TicketStatus.OPEN ||
      ticket.status === TicketStatus.IN_PROGRESS ||
      ticket.status === TicketStatus.PENDING_CUSTOMER;

    return await prisma.$transaction(async (tx) => {
      // Concurrency Guard: Atomic check-and-increment to prevent workload limits from being exceeded
      const workloadUpdateResult = await tx.agentProfile.updateMany({
        where: {
          id: selectedAgent.id,
          currentWorkload: { lt: selectedAgent.maxWorkload },
        },
        data: {
          currentWorkload: { increment: 1 },
        },
      });

      if (workloadUpdateResult.count === 0) {
        throw new Error(
          `Concurrency Conflict: Agent ${selectedAgent.name} reached maximum workload while routing ticket ${ticket.id}. Re-evaluation required.`
        );
      }

      // Decrement previous agent's workload if ticket was already active with another agent
      if (previousAgentId && previousAgentId !== selectedAgent.userId && isTicketActive) {
        await tx.agentProfile.updateMany({
          where: {
            userId: previousAgentId,
            currentWorkload: { gt: 0 },
          },
          data: {
            currentWorkload: { decrement: 1 },
          },
        });
      }

      // Update Ticket
      await tx.ticket.update({
        where: { id: ticket.id },
        data: {
          assignedAgentId: selectedAgent.userId,
          departmentId,
          routingStatus: RoutingStatus.ASSIGNED,
          assignedAt: new Date(),
        },
      });

      // Record in dedicated TicketAssignmentHistory
      await tx.ticketAssignmentHistory.create({
        data: {
          ticketId: ticket.id,
          previousAgentId: previousAgentId || null,
          newAgentId: selectedAgent.userId,
          assignedById: options.actorId || null,
          assignmentType: options.assignmentType || AssignmentType.AUTOMATED,
          reason: options.reason || 'Intelligent routing based on NLP category and agent score',
          score: bestCandidate.scores.compositeScore,
        },
      });

      // Record Activity Audit Log
      await tx.ticketActivity.create({
        data: {
          ticketId: ticket.id,
          actorId: options.actorId || null,
          action:
            options.assignmentType === AssignmentType.REASSIGNMENT
              ? ActivityAction.AUTO_REASSIGNED
              : ActivityAction.TICKET_ROUTED,
          details: {
            assignedAgentId: selectedAgent.userId,
            assignedAgentName: selectedAgent.name,
            departmentId,
            scores: bestCandidate.scores,
            assignmentType: options.assignmentType || AssignmentType.AUTOMATED,
            reason: options.reason || 'Optimal score candidate selected',
          } as unknown as Prisma.InputJsonValue,
        },
      });

      logger.info(
        `Successfully routed ticket ${ticket.id} to agent ${selectedAgent.name} (Score: ${bestCandidate.scores.compositeScore})`
      );

      return {
        ticketId: ticket.id,
        departmentId,
        selectedAgent,
        scores: bestCandidate.scores,
        evaluatedCandidatesCount: candidates.length,
        isFallback: false,
      };
    });
  }
}

export const assignmentService = new AssignmentService();
