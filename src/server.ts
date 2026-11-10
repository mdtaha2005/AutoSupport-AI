import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { prisma } from './config/prisma.js';
import { workerCluster } from './modules/queues/workers/index.js';
import { queueManager } from './modules/queues/queue.manager.js';
import { redisManager } from './config/redis.js';

async function bootstrap() {
  try {
    // Verify database connectivity
    await prisma.$connect();
    logger.info('Database connection established successfully via Prisma');

    // Start BullMQ workers cluster
    await workerCluster.start();

    const server = app.listen(env.PORT, () => {
      logger.info(`Server is running in ${env.NODE_ENV} mode on port ${env.PORT}`);
      logger.info(`REST API Base URL: http://localhost:${env.PORT}${env.API_PREFIX}`);
      logger.info(`Swagger API Documentation: http://localhost:${env.PORT}/api-docs`);
    });

    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}. Initiating graceful shutdown...`);
      server.close(async () => {
        logger.info('HTTP server closed.');
        await workerCluster.stop();
        await queueManager.closeAll();
        await redisManager.disconnect();
        await prisma.$disconnect();
        logger.info('Database and queue connections closed.');
        process.exit(0);
      });

      // Force exit if graceful shutdown takes too long
      setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error('Failed to start server:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

bootstrap();
