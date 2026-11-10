import { Queue } from 'bullmq';
import { redisManager } from '../../config/redis.js';
import { logger } from '../../config/logger.js';
import {
  QUEUE_NAMES,
  DEFAULT_JOB_OPTIONS,
  ESCALATION_JOB_OPTIONS,
  getAssignmentJobId,
  getReassignmentJobId,
  getEscalationJobId,
} from '../../config/queue.config.js';
import { assignmentService } from '../routing/assignment.service.js';
import { reassignmentService } from '../routing/reassignment.service.js';
import { escalationService } from '../routing/escalation.service.js';
import { RouteTicketOptions } from '../routing/routing.types.js';

export interface AssignmentJobData {
  ticketId: string;
  options?: RouteTicketOptions;
}

export interface ReassignmentJobData {
  agentUserId: string;
  reason?: string;
  forceManualReassignment?: boolean;
}

export interface EscalationJobData {
  ticketId: string;
  reason?: string;
}

export class QueueManager {
  private assignmentQueue: Queue<AssignmentJobData> | null = null;
  private reassignmentQueue: Queue<ReassignmentJobData> | null = null;
  private escalationQueue: Queue<EscalationJobData> | null = null;

  private getQueue<T>(name: string): Queue<T> | null {
    try {
      const connection = redisManager.getClient();
      return new Queue<T>(name, { connection } as never);
    } catch (error) {
      logger.warn(`Failed to instantiate BullMQ queue '${name}': ${(error as Error).message}`);
      return null;
    }
  }

  public getAssignmentQueue(): Queue<AssignmentJobData> | null {
    if (!this.assignmentQueue) {
      this.assignmentQueue = this.getQueue<AssignmentJobData>(QUEUE_NAMES.TICKET_ASSIGNMENT);
    }
    return this.assignmentQueue;
  }

  public getReassignmentQueue(): Queue<ReassignmentJobData> | null {
    if (!this.reassignmentQueue) {
      this.reassignmentQueue = this.getQueue<ReassignmentJobData>(QUEUE_NAMES.TICKET_REASSIGNMENT);
    }
    return this.reassignmentQueue;
  }

  public getEscalationQueue(): Queue<EscalationJobData> | null {
    if (!this.escalationQueue) {
      this.escalationQueue = this.getQueue<EscalationJobData>(QUEUE_NAMES.TICKET_ESCALATION);
    }
    return this.escalationQueue;
  }

  /**
   * Enqueue a ticket assignment job with duplicate prevention.
   * If Redis is unavailable, gracefully executes synchronously as safe fallback.
   */
  async enqueueAssignment(ticketId: string, options?: RouteTicketOptions): Promise<void> {
    const queue = this.getAssignmentQueue();
    const jobId = getAssignmentJobId(ticketId);

    if (queue && redisManager.isAvailable()) {
      try {
        await queue.add(
          'assign-ticket',
          { ticketId, options },
          {
            ...DEFAULT_JOB_OPTIONS,
            jobId, // Prevents duplicate concurrent jobs for the same ticket
          }
        );
        logger.info(`Enqueued ticket assignment job [${jobId}] for ticket ${ticketId}`);
        return;
      } catch (err) {
        logger.warn(`Failed to enqueue assignment job [${jobId}]: ${(err as Error).message}. Running fallback.`);
      }
    }

    // Synchronous Fallback (Redis unavailable / testing)
    logger.debug(`Redis queue unavailable. Executing synchronous routing fallback for ticket ${ticketId}`);
    try {
      await assignmentService.routeTicket(ticketId, options);
    } catch (fallbackError) {
      logger.error(`Synchronous routing fallback failed for ticket ${ticketId}: ${(fallbackError as Error).message}`);
    }
  }

  /**
   * Enqueue reassignment when agent becomes unavailable.
   */
  async enqueueReassignment(
    agentUserId: string,
    reason = 'Agent availability changed to OFFLINE',
    forceManualReassignment = false
  ): Promise<void> {
    const queue = this.getReassignmentQueue();
    const jobId = getReassignmentJobId(agentUserId);

    if (queue && redisManager.isAvailable()) {
      try {
        await queue.add(
          'reassign-agent-tickets',
          { agentUserId, reason, forceManualReassignment },
          {
            ...DEFAULT_JOB_OPTIONS,
            jobId,
          }
        );
        logger.info(`Enqueued agent reassignment job [${jobId}] for agent ${agentUserId}`);
        return;
      } catch (err) {
        logger.warn(`Failed to enqueue reassignment job: ${(err as Error).message}. Running fallback.`);
      }
    }

    // Synchronous Fallback
    try {
      await reassignmentService.reassignAgentTickets(agentUserId, reason, forceManualReassignment);
    } catch (fallbackError) {
      logger.error(`Synchronous reassignment fallback failed for agent ${agentUserId}: ${(fallbackError as Error).message}`);
    }
  }

  /**
   * Enqueue a delayed priority-aware SLA escalation job.
   */
  async enqueueEscalation(ticketId: string, delayMs = 0, reason = 'SLA escalation trigger'): Promise<void> {
    const queue = this.getEscalationQueue();
    const jobId = getEscalationJobId(ticketId);

    if (queue && redisManager.isAvailable()) {
      try {
        await queue.add(
          'escalate-ticket',
          { ticketId, reason },
          {
            ...ESCALATION_JOB_OPTIONS,
            jobId,
            delay: delayMs,
          }
        );
        logger.info(`Enqueued ticket escalation job [${jobId}] with delay ${delayMs}ms for ticket ${ticketId}`);
        return;
      } catch (err) {
        logger.warn(`Failed to enqueue escalation job: ${(err as Error).message}. Running fallback.`);
      }
    }

    // If no delay requested and Redis down, execute immediately
    if (delayMs === 0) {
      try {
        await escalationService.escalateTicket(ticketId, reason);
      } catch (fallbackError) {
        logger.error(`Synchronous escalation fallback failed for ticket ${ticketId}: ${(fallbackError as Error).message}`);
      }
    }
  }

  public async closeAll(): Promise<void> {
    const queues = [this.assignmentQueue, this.reassignmentQueue, this.escalationQueue];
    for (const q of queues) {
      if (q) {
        try {
          await q.close();
        } catch {
          // ignore
        }
      }
    }
    this.assignmentQueue = null;
    this.reassignmentQueue = null;
    this.escalationQueue = null;
  }
}

export const queueManager = new QueueManager();
