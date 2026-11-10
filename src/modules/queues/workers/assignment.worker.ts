import { Worker, Job } from 'bullmq';
import { redisManager } from '../../../config/redis.js';
import { logger } from '../../../config/logger.js';
import { QUEUE_NAMES } from '../../../config/queue.config.js';
import { assignmentService } from '../../routing/assignment.service.js';
import { AssignmentJobData } from '../queue.manager.js';

export function createAssignmentWorker(): Worker<AssignmentJobData> | null {
  try {
    const connection = redisManager.getRedisOptions();
    const worker = new Worker<AssignmentJobData>(
      QUEUE_NAMES.TICKET_ASSIGNMENT,
      async (job: Job<AssignmentJobData>) => {
        const { ticketId, options } = job.data;
        logger.info(`[Worker:Assignment] Processing assignment job ${job.id} for ticket ${ticketId} (Attempt ${job.attemptsMade + 1})`);

        const decision = await assignmentService.routeTicket(ticketId, options);
        return decision;
      },
      {
        connection: redisManager.getClient() as never,
        concurrency: 5,
      }
    );

    worker.on('completed', (job) => {
      logger.info(`[Worker:Assignment] Job ${job.id} completed successfully`);
    });

    worker.on('failed', (job, err) => {
      logger.error(`[Worker:Assignment] Job ${job?.id} failed on attempt ${job?.attemptsMade}: ${err.message}`);
    });

    worker.on('error', (err) => {
      logger.warn(`[Worker:Assignment] Redis worker warning: ${err.message}`);
    });

    return worker;
  } catch (err) {
    logger.warn(`Failed to initialize assignment worker: ${(err as Error).message}`);
    return null;
  }
}
