import { Router } from 'express';
import { activityController } from './activity.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { validateRequest } from '../../middleware/validate.middleware.js';
import { activityTicketParamSchema } from './activity.validation.js';

const router = Router({ mergeParams: true });

router.use(authenticate as never);

/**
 * @openapi
 * /tickets/{ticketId}/activities:
 *   get:
 *     summary: Get complete activity audit history for a ticket
 *     tags: [Activities]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticketId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: List of activity history logs
 */
router.get(
  '/',
  validateRequest({ params: activityTicketParamSchema }),
  activityController.getActivities.bind(activityController) as never
);

export const activityRoutes = router;
