import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { departmentController } from './department.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { authorizeRoles } from '../../middleware/rbac.middleware.js';
import { validateRequest } from '../../middleware/validate.middleware.js';
import {
  createDepartmentSchema,
  updateDepartmentSchema,
  departmentIdParamSchema,
} from './department.validation.js';

const router = Router();

// All department routes require authentication
router.use(authenticate as never);

/**
 * @openapi
 * /departments:
 *   post:
 *     summary: Create a new department
 *     tags: [Departments]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *     responses:
 *       201:
 *         description: Department created
 */
router.post(
  '/',
  authorizeRoles(UserRole.ADMIN),
  validateRequest({ body: createDepartmentSchema }),
  departmentController.create.bind(departmentController) as never
);

/**
 * @openapi
 * /departments:
 *   get:
 *     summary: List all departments
 *     tags: [Departments]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of departments
 */
router.get(
  '/',
  authorizeRoles(UserRole.ADMIN, UserRole.MANAGER, UserRole.AGENT),
  departmentController.findAll.bind(departmentController) as never
);

/**
 * @openapi
 * /departments/{id}:
 *   get:
 *     summary: Get department details by ID
 *     tags: [Departments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Department details
 */
router.get(
  '/:id',
  authorizeRoles(UserRole.ADMIN, UserRole.MANAGER, UserRole.AGENT),
  validateRequest({ params: departmentIdParamSchema }),
  departmentController.findById.bind(departmentController) as never
);

/**
 * @openapi
 * /departments/{id}:
 *   put:
 *     summary: Update department details
 *     tags: [Departments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Department updated
 */
router.put(
  '/:id',
  authorizeRoles(UserRole.ADMIN),
  validateRequest({ params: departmentIdParamSchema, body: updateDepartmentSchema }),
  departmentController.update.bind(departmentController) as never
);

/**
 * @openapi
 * /departments/{id}:
 *   delete:
 *     summary: Deactivate department
 *     tags: [Departments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Department deactivated
 */
router.delete(
  '/:id',
  authorizeRoles(UserRole.ADMIN),
  validateRequest({ params: departmentIdParamSchema }),
  departmentController.delete.bind(departmentController) as never
);

export const departmentRoutes = router;
