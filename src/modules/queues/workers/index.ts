import { Worker } from 'bullmq';
import { createAssignmentWorker } from './assignment.worker.js';
import { createReassignmentWorker } from './reassignment.worker.js';
import { createEscalationWorker } from './escalation.worker.js';
import { logger } from '../../../config/logger.js';
import { redisManager } from '../../../config/redis.js';

class WorkerCluster {
  private workers: Worker[] = [];
  private isInitialized = false;

  public async start(): Promise<void> {
    if (this.isInitialized) return;

    const isRedisReady = await redisManager.connect();
    if (!isRedisReady) {
      logger.info('Redis not available; workers will not be launched (synchronous execution mode active).');
      return;
    }

    const assignmentWorker = createAssignmentWorker();
    const reassignmentWorker = createReassignmentWorker();
    const escalationWorker = createEscalationWorker();

    [assignmentWorker, reassignmentWorker, escalationWorker].forEach((w) => {
      if (w) this.workers.push(w);
    });

    this.isInitialized = true;
    logger.info(`BullMQ workers initialized successfully (${this.workers.length} active workers)`);
  }

  public async stop(): Promise<void> {
    logger.info('Stopping BullMQ workers...');
    for (const worker of this.workers) {
      try {
        await worker.close();
      } catch {
        // ignore
      }
    }
    this.workers = [];
    this.isInitialized = false;
  }
}

export const workerCluster = new WorkerCluster();
