import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { authenticate } from '../../middleware/auth.middleware.js';
import { authorizeRoles } from '../../middleware/rbac.middleware.js';
import { analyticsController } from './analytics.controller.js';

const router = Router();

// Staff-only access for operational intelligence
router.use(authenticate);
router.use(authorizeRoles(UserRole.ADMIN, UserRole.MANAGER, UserRole.AGENT));

// Analytics API Endpoints
router.get('/overview', (req, res, next) => analyticsController.getOverview(req, res, next));
router.get('/volume', (req, res, next) => analyticsController.getTicketVolume(req, res, next));
router.get('/categories', (req, res, next) => analyticsController.getCategories(req, res, next));
router.get('/resolution-time', (req, res, next) => analyticsController.getResolutionTime(req, res, next));
router.get('/agent-workload', (req, res, next) => analyticsController.getAgentWorkload(req, res, next));
router.get('/assignment-distribution', (req, res, next) => analyticsController.getAssignmentDistribution(req, res, next));
router.get('/escalations', (req, res, next) => analyticsController.getEscalations(req, res, next));
router.get('/status-distribution', (req, res, next) => analyticsController.getStatusDistribution(req, res, next));

export { router as analyticsRoutes };
