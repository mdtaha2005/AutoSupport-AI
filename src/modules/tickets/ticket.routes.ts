import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { ticketController } from './ticket.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { authorizeRoles } from '../../middleware/rbac.middleware.js';
import { validateRequest } from '../../middleware/validate.middleware.js';
import {
  createTicketSchema,
  updateTicketSchema,
  updateStatusSchema,
  assignTicketSchema,
  ticketFilterSchema,
  ticketIdParamSchema,
} from './ticket.validation.js';
import { AuthenticatedRequest } from '../../types/index.js';
import { verifyJwt } from '../../utils/jwt.js';

const router = Router();

// Optional authentication helper for guest/public ticket creation
function optionalAuthenticate(req: AuthenticatedRequest, _res: unknown, next: () => void) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      if (token) {
        req.user = verifyJwt(token);
      }
    } catch {
      // Ignored for guest creation
    }
  }
  next();
}

/**
 * @openapi
 * /tickets:
 *   post:
 *     summary: Create a support ticket
 *     tags: [Tickets]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, description]
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *               priority: { type: string, enum: [LOW, MEDIUM, HIGH, URGENT] }
 *               departmentId: { type: string, format: uuid }
 *               customerName: { type: string }
 *               customerEmail: { type: string, format: email }
 *     responses:
 *       201:
 *         description: Ticket created
 */
router.post(
  '/',
  optionalAuthenticate as never,
  validateRequest({ body: createTicketSchema }),
  ticketController.createTicket.bind(ticketController) as never
);

/**
 * @openapi
 * /tickets:
 *   get:
 *     summary: List tickets with filtering and pagination
 *     tags: [Tickets]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [OPEN, IN_PROGRESS, PENDING_CUSTOMER, RESOLVED, CLOSED] }
 *       - in: query
 *         name: priority
 *         schema: { type: string, enum: [LOW, MEDIUM, HIGH, URGENT] }
 *       - in: query
 *         name: category
 *         schema: { type: string, enum: [PAYMENT, REFUND, DELIVERY, ACCOUNT, TECHNICAL, PRODUCT, OTHER] }
 *       - in: query
 *         name: needsHumanReview
 *         schema: { type: boolean }
 *       - in: query
 *         name: departmentId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: assignedAgentId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: List of tickets
 */
router.get(
  '/',
  authenticate as never,
  validateRequest({ query: ticketFilterSchema }),
  ticketController.listTickets.bind(ticketController) as never
);

/**
 * @openapi
 * /tickets/preview-nlp:
 *   post:
 *     summary: Preview NLP classification, entities and sentiment on arbitrary text without creating ticket
 *     tags: [Tickets]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, description]
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *     responses:
 *       200:
 *         description: NLP preview analysis
 */
router.post(
  '/preview-nlp',
  ticketController.previewNlp.bind(ticketController) as never
);

/**
 * @openapi
 * /tickets/{id}:
 *   get:
 *     summary: Get single ticket details by ID
 *     tags: [Tickets]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Ticket details
 */
router.get(
  '/:id',
  authenticate as never,
  validateRequest({ params: ticketIdParamSchema }),
  ticketController.getTicketById.bind(ticketController) as never
);

/**
 * @openapi
 * /tickets/{id}:
 *   put:
 *     summary: Update ticket details (title, description, priority, department)
 *     tags: [Tickets]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Ticket updated
 */
router.put(
  '/:id',
  authenticate as never,
  authorizeRoles(UserRole.ADMIN, UserRole.MANAGER, UserRole.AGENT),
  validateRequest({ params: ticketIdParamSchema, body: updateTicketSchema }),
  ticketController.updateTicket.bind(ticketController) as never
);

/**
 * @openapi
 * /tickets/{id}/status:
 *   patch:
 *     summary: Update ticket status
 *     tags: [Tickets]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Status updated
 */
router.patch(
  '/:id/status',
  authenticate as never,
  authorizeRoles(UserRole.ADMIN, UserRole.MANAGER, UserRole.AGENT),
  validateRequest({ params: ticketIdParamSchema, body: updateStatusSchema }),
  ticketController.updateStatus.bind(ticketController) as never
);

/**
 * @openapi
 * /tickets/{id}/assign:
 *   post:
 *     summary: Manually assign or reassign ticket to an agent
 *     tags: [Tickets]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [agentId]
 *             properties:
 *               agentId: { type: string, format: uuid }
 *               reason: { type: string }
 *     responses:
 *       200:
 *         description: Ticket assigned
 */
router.post(
  '/:id/assign',
  authenticate as never,
  authorizeRoles(UserRole.ADMIN, UserRole.MANAGER),
  validateRequest({ params: ticketIdParamSchema, body: assignTicketSchema }),
  ticketController.assignTicket.bind(ticketController) as never
);

/**
 * @openapi
 * /tickets/{id}/analyze:
 *   post:
 *     summary: Trigger manual NLP analysis and category/intent classification for a ticket
 *     tags: [Tickets]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Ticket analyzed with NLP successfully
 *       404:
 *         description: Ticket not found
 */
router.post(
  '/:id/analyze',
  authenticate as never,
  authorizeRoles(UserRole.ADMIN, UserRole.MANAGER, UserRole.AGENT),
  validateRequest({ params: ticketIdParamSchema }),
  ticketController.analyzeTicket.bind(ticketController) as never
);

/**
 * @openapi
 * /tickets/{id}/route:
 *   post:
 *     summary: Trigger intelligent automated department routing and agent assignment
 *     tags: [Tickets]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Ticket routed and assigned successfully
 *       404:
 *         description: Ticket not found
 */
router.post(
  '/:id/route',
  authenticate as never,
  authorizeRoles(UserRole.ADMIN, UserRole.MANAGER),
  validateRequest({ params: ticketIdParamSchema }),
  ticketController.routeTicket.bind(ticketController) as never
);

export const ticketRoutes = router;
