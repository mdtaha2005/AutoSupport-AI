import { Router } from 'express';
import { commentController } from './comment.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { validateRequest } from '../../middleware/validate.middleware.js';
import { createCommentSchema, ticketIdParamSchema } from './comment.validation.js';

const router = Router({ mergeParams: true });

router.use(authenticate as never);

/**
 * @openapi
 * /tickets/{ticketId}/comments:
 *   post:
 *     summary: Add comment or internal note to a ticket
 *     tags: [Comments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticketId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               content: { type: string }
 *               isInternal: { type: boolean, default: false }
 *     responses:
 *       201:
 *         description: Comment added
 */
router.post(
  '/',
  validateRequest({ params: ticketIdParamSchema, body: createCommentSchema }),
  commentController.addComment.bind(commentController) as never
);

/**
 * @openapi
 * /tickets/{ticketId}/comments:
 *   get:
 *     summary: Get all comments for a ticket
 *     tags: [Comments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticketId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: List of comments
 */
router.get(
  '/',
  validateRequest({ params: ticketIdParamSchema }),
  commentController.getComments.bind(commentController) as never
);

export const commentRoutes = router;
