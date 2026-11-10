import { Router } from 'express';
import { authController } from './auth.controller.js';
import { validateRequest } from '../../middleware/validate.middleware.js';
import { registerSchema, loginSchema, changePasswordSchema } from './auth.validation.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { AuthenticatedRequest } from '../../types/index.js';
import { verifyJwt } from '../../utils/jwt.js';

const router = Router();

// Optional auth middleware: if Authorization header is present, extracts user
function optionalAuthenticate(req: AuthenticatedRequest, _res: unknown, next: () => void) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      if (token) {
        req.user = verifyJwt(token);
      }
    } catch {
      // Ignored for optional auth
    }
  }
  next();
}

/**
 * @openapi
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, name]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *               name: { type: string }
 *               role: { type: string, enum: [ADMIN, MANAGER, AGENT, CUSTOMER] }
 *     responses:
 *       201:
 *         description: Registered successfully
 */
router.post(
  '/register',
  optionalAuthenticate as never,
  validateRequest({ body: registerSchema }),
  authController.register.bind(authController) as never
);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     summary: User login
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Login successful with JWT
 */
router.post(
  '/login',
  validateRequest({ body: loginSchema }),
  authController.login.bind(authController) as never
);

/**
 * @openapi
 * /auth/me:
 *   get:
 *     summary: Get profile of authenticated user
 *     tags: [Authentication]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: User profile
 */
router.get(
  '/me',
  authenticate as never,
  authController.getProfile.bind(authController) as never
);

/**
 * @openapi
 * /auth/change-password:
 *   post:
 *     summary: Change current user password
 *     tags: [Authentication]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string }
 *               newPassword: { type: string }
 *     responses:
 *       200:
 *         description: Password updated
 */
router.post(
  '/change-password',
  authenticate as never,
  validateRequest({ body: changePasswordSchema }),
  authController.changePassword.bind(authController) as never
);

export const authRoutes = router;
