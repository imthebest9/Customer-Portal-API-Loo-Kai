import { RequestHandler, Router } from 'express';
import { container } from 'tsyringe';
import { CustomerController } from '../controllers/customer.controller';
import { asyncHandler } from '../middlewares/async-handler';
import { validate } from '../middlewares/validate';
import {
  changePasswordSchema,
  updateProfileSchema,
} from '../../../application/validators/schemas';

/**
 * @openapi
 * tags:
 *   - name: Customer
 *     description: Authenticated customer self-service
 */
export function customerRoutes(authenticate: RequestHandler): Router {
  const router = Router();
  const controller = container.resolve(CustomerController);

  router.use(authenticate);

  /**
   * @openapi
   * /api/customers/me:
   *   get:
   *     tags: [Customer]
   *     summary: Get my profile
   *     security: [{ bearerAuth: [] }]
   *     responses:
   *       200:
   *         description: The current customer's profile
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/Customer' }
   *       401: { description: Unauthorized }
   */
  router.get('/me', asyncHandler(controller.getMe));

  /**
   * @openapi
   * /api/customers/me:
   *   patch:
   *     tags: [Customer]
   *     summary: Update my profile (name, phone, address)
   *     security: [{ bearerAuth: [] }]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { $ref: '#/components/schemas/UpdateProfileRequest' }
   *     responses:
   *       200:
   *         description: Updated profile
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/Customer' }
   *       401: { description: Unauthorized }
   *       422: { description: Validation failed }
   */
  router.patch('/me', validate(updateProfileSchema), asyncHandler(controller.updateMe));

  /**
   * @openapi
   * /api/customers/me/password:
   *   patch:
   *     tags: [Customer]
   *     summary: Change my password
   *     security: [{ bearerAuth: [] }]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { $ref: '#/components/schemas/ChangePasswordRequest' }
   *     responses:
   *       204: { description: Password changed }
   *       401: { description: Current password incorrect / unauthorized }
   *       422: { description: Validation failed }
   */
  router.patch(
    '/me/password',
    validate(changePasswordSchema),
    asyncHandler(controller.changePassword),
  );

  return router;
}
