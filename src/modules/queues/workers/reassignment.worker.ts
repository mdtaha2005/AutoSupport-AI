import { Worker, Job } from 'bullmq';
import { redisManager } from '../../../config/redis.js';
import { logger } from '../../../config/logger.js';
import { QUEUE_NAMES } from '../../../config/queue.config.js';
import { reassignmentService } from '../../routing/reassignment.service.js';
import { ReassignmentJobData } from '../queue.manager.js';

export function createReassignmentWorker(): Worker<ReassignmentJobData> | null {
  try {
    const connection = redisManager.getRedisOptions();
    const worker = new Worker<ReassignmentJobData>(
      QUEUE_NAMES.TICKET_REASSIGNMENT,
      async (job: Job<ReassignmentJobData>) => {
        const { agentUserId, reason, forceManualReassignment } = job.data;
        logger.info(
          `[Worker:Reassignment] Processing reassignment job ${job.id} for agent ${agentUserId} (Attempt ${job.attemptsMade + 1})`
        );

        const result = await reassignmentService.reassignAgentTickets(agentUserId, reason, forceManualReassignment);
        return result;
      },
      {
        connection: redisManager.getClient() as never,
        concurrency: 3,
      }
    );

    worker.on('completed', (job) => {
      logger.info(`[Worker:Reassignment] Job ${job.id} completed successfully`);
    });

    worker.on('failed', (job, err) => {
      logger.error(`[Worker:Reassignment] Job ${job?.id} failed on attempt ${job?.attemptsMade}: ${err.message}`);
    });

    worker.on('error', (err) => {
      logger.warn(`[Worker:Reassignment] Redis worker warning: ${err.message}`);
    });

    return worker;
  } catch (err) {
    logger.warn(`Failed to initialize reassignment worker: ${(err as Error).message}`);
    return null;
  }
}
