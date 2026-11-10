import { Worker, Job } from 'bullmq';
import { redisManager } from '../../../config/redis.js';
import { logger } from '../../../config/logger.js';
import { QUEUE_NAMES } from '../../../config/queue.config.js';
import { escalationService } from '../../routing/escalation.service.js';
import { EscalationJobData } from '../queue.manager.js';

export function createEscalationWorker(): Worker<EscalationJobData> | null {
  try {
    const connection = redisManager.getRedisOptions();
    const worker = new Worker<EscalationJobData>(
      QUEUE_NAMES.TICKET_ESCALATION,
      async (job: Job<EscalationJobData>) => {
        const { ticketId, reason } = job.data;
        logger.info(
          `[Worker:Escalation] Processing escalation job ${job.id} for ticket ${ticketId} (Attempt ${job.attemptsMade + 1})`
        );

        const result = await escalationService.escalateTicket(ticketId, reason);
        return result;
      },
      {
        connection: redisManager.getClient() as never,
        concurrency: 3,
      }
    );

    worker.on('completed', (job) => {
      logger.info(`[Worker:Escalation] Job ${job.id} completed successfully`);
    });

    worker.on('failed', (job, err) => {
      logger.error(`[Worker:Escalation] Job ${job?.id} failed on attempt ${job?.attemptsMade}: ${err.message}`);
    });

    worker.on('error', (err) => {
      logger.warn(`[Worker:Escalation] Redis worker warning: ${err.message}`);
    });

    return worker;
  } catch (err) {
    logger.warn(`Failed to initialize escalation worker: ${(err as Error).message}`);
    return null;
  }
}
