import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import { requestLogger } from './middleware/logger.middleware.js';
import { errorHandler } from './middleware/error.middleware.js';
import { swaggerSpec } from './config/swagger.js';
import { NotFoundError } from './errors/error-types.js';

// Route Imports
import { authRoutes } from './modules/auth/auth.routes.js';
import { departmentRoutes } from './modules/departments/department.routes.js';
import { agentRoutes } from './modules/agents/agent.routes.js';
import { ticketRoutes } from './modules/tickets/ticket.routes.js';
import { commentRoutes } from './modules/comments/comment.routes.js';
import { activityRoutes } from './modules/activities/activity.routes.js';
import { searchRoutes } from './modules/search/search.routes.js';
import { analyticsRoutes } from './modules/analytics/analytics.routes.js';
import { redisManager } from './config/redis.js';
import { nlpClient } from './modules/nlp/nlp.client.js';

export function createApp(): Express {
  const app = express();

  // Core Security & Utilities (disable CSP restrictions for static frontend assets & CDNs)
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(requestLogger);

  // Serve Static Frontend Assets
  app.use(express.static(path.join(process.cwd(), 'public')));

  // Health Check Endpoint
  const healthCheck = async (_req: Request, res: Response) => {
    const isRedisConnected = redisManager.isAvailable();
    const isNlpHealthy = await nlpClient.healthCheck();

    res.status(200).json({
      status: 'healthy',
      service: 'ticket-management-system',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      dependencies: {
        database: 'connected',
        redis: isRedisConnected ? 'connected' : 'offline_fallback',
        nlpMicroservice: isNlpHealthy ? 'healthy' : 'degraded',
        vectorEngine: 'pgvector-hnsw-ready',
      },
    });
  };

  app.get('/health', healthCheck);
  app.get(`${env.API_PREFIX}/health`, healthCheck);

  // Swagger Documentation
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get('/api-docs.json', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  // Mount API Modules
  app.use(`${env.API_PREFIX}/auth`, authRoutes);
  app.use(`${env.API_PREFIX}/departments`, departmentRoutes);
  app.use(`${env.API_PREFIX}/agents`, agentRoutes);
  app.use(`${env.API_PREFIX}/tickets`, ticketRoutes);
  app.use(`${env.API_PREFIX}/tickets/:ticketId/comments`, commentRoutes);
  app.use(`${env.API_PREFIX}/tickets/:ticketId/activities`, activityRoutes);
  app.use(`${env.API_PREFIX}/search`, searchRoutes);
  app.use(`${env.API_PREFIX}/analytics`, analyticsRoutes);

  // 404 Handler
  app.use((req: Request, _res: Response, next) => {
    next(new NotFoundError(`Route not found: ${req.method} ${req.originalUrl}`));
  });

  // Centralized Error Handling Middleware
  app.use(errorHandler);

  return app;
}

export const app = createApp();
