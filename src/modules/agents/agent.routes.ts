import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { agentController } from './agent.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { authorizeRoles } from '../../middleware/rbac.middleware.js';
import { validateRequest } from '../../middleware/validate.middleware.js';
import {
  updateAgentProfileSchema,
  updateAvailabilitySchema,
  agentFilterSchema,
  agentIdParamSchema,
} from './agent.validation.js';

const router = Router();

router.use(authenticate as never);

/**
 * @openapi
 * /agents:
 *   get:
 *     summary: List agents with filters
 *     tags: [Agents]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: departmentId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: availabilityStatus
 *         schema: { type: string, enum: [AVAILABLE, BUSY, OFFLINE] }
 *       - in: query
 *         name: skill
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: List of agent profiles
 */
router.get(
  '/',
  authorizeRoles(UserRole.ADMIN, UserRole.MANAGER, UserRole.AGENT),
  validateRequest({ query: agentFilterSchema }),
  agentController.listAgents.bind(agentController) as never
);

/**
 * @openapi
 * /agents/{id}:
 *   get:
 *     summary: Get agent profile by ID
 *     tags: [Agents]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Agent details
 */
router.get(
  '/:id',
  authorizeRoles(UserRole.ADMIN, UserRole.MANAGER, UserRole.AGENT),
  validateRequest({ params: agentIdParamSchema }),
  agentController.getAgentById.bind(agentController) as never
);

/**
 * @openapi
 * /agents/{id}:
 *   put:
 *     summary: Update agent profile (skills, maxWorkload, department)
 *     tags: [Agents]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Agent profile updated
 */
router.put(
  '/:id',
  authorizeRoles(UserRole.ADMIN, UserRole.MANAGER),
  validateRequest({ params: agentIdParamSchema, body: updateAgentProfileSchema }),
  agentController.updateProfile.bind(agentController) as never
);

/**
 * @openapi
 * /agents/{id}/availability:
 *   patch:
 *     summary: Update agent availability status
 *     tags: [Agents]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Availability updated
 */
router.patch(
  '/:id/availability',
  authorizeRoles(UserRole.ADMIN, UserRole.MANAGER, UserRole.AGENT),
  validateRequest({ params: agentIdParamSchema, body: updateAvailabilitySchema }),
  agentController.updateAvailability.bind(agentController) as never
);

/**
 * @openapi
 * /agents/{id}/workload:
 *   get:
 *     summary: Get agent real-time workload stats
 *     tags: [Agents]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Workload stats
 */
router.get(
  '/:id/workload',
  authorizeRoles(UserRole.ADMIN, UserRole.MANAGER, UserRole.AGENT),
  validateRequest({ params: agentIdParamSchema }),
  agentController.getWorkload.bind(agentController) as never
);

export const agentRoutes = router;
