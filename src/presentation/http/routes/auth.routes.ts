import { Router } from 'express';
import { container } from 'tsyringe';
import { AuthController } from '../controllers/auth.controller';
import { asyncHandler } from '../middlewares/async-handler';
import { validate } from '../middlewares/validate';
import { loginSchema, registerSchema } from '../../../application/validators/schemas';

/**
 * @openapi
 * tags:
 *   - name: Auth
 *     description: Registration and login
 */
export function authRoutes(): Router {
  const router = Router();
  const controller = container.resolve(AuthController);

  /**
   * @openapi
   * /api/auth/register:
   *   post:
   *     tags: [Auth]
   *     summary: Register a new customer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { $ref: '#/components/schemas/RegisterRequest' }
   *     responses:
   *       201:
   *         description: Customer created; returns the customer and a JWT.
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/AuthResponse' }
   *       409: { description: Email already registered }
   *       422: { description: Validation failed }
   */
  router.post('/register', validate(registerSchema), asyncHandler(controller.register));

  /**
   * @openapi
   * /api/auth/login:
   *   post:
   *     tags: [Auth]
   *     summary: Log in with email and password
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { $ref: '#/components/schemas/LoginRequest' }
   *     responses:
   *       200:
   *         description: Authenticated; returns the customer and a JWT.
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/AuthResponse' }
   *       401: { description: Invalid credentials }
   */
  router.post('/login', validate(loginSchema), asyncHandler(controller.login));

  return router;
}
