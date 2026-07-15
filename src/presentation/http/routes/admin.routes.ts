import { RequestHandler, Router } from 'express';
import { container } from 'tsyringe';
import { AdminController } from '../controllers/admin.controller';
import { requireRole } from '../middlewares/auth';
import { asyncHandler } from '../middlewares/async-handler';
import { validate } from '../middlewares/validate';
import { Role } from '../../../domain/entities/enums';
import {
  idParamSchema,
  paginationSchema,
  updateOrderStatusSchema,
} from '../../../application/validators/schemas';

/**
 * @openapi
 * tags:
 *   - name: Admin
 *     description: Administrator-only management endpoints (role=admin)
 */
export function adminRoutes(authenticate: RequestHandler): Router {
  const router = Router();
  const controller = container.resolve(AdminController);

  // Every admin route requires a valid JWT *and* the admin role.
  router.use(authenticate, requireRole(Role.Admin));

  /**
   * @openapi
   * /api/admin/customers:
   *   get:
   *     tags: [Admin]
   *     summary: List all customers (paginated)
   *     security: [{ bearerAuth: [] }]
   *     parameters:
   *       - $ref: '#/components/parameters/PageParam'
   *       - $ref: '#/components/parameters/LimitParam'
   *     responses:
   *       200:
   *         description: Paginated customers
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/PaginatedCustomers' }
   *       403: { description: Admin role required }
   */
  router.get('/customers', validate(paginationSchema), asyncHandler(controller.listCustomers));

  /**
   * @openapi
   * /api/admin/customers/{id}:
   *   delete:
   *     tags: [Admin]
   *     summary: Delete a customer account
   *     security: [{ bearerAuth: [] }]
   *     parameters:
   *       - $ref: '#/components/parameters/IdParam'
   *     responses:
   *       204: { description: Customer deleted }
   *       404: { description: Customer not found }
   */
  router.delete('/customers/:id', validate(idParamSchema), asyncHandler(controller.deleteCustomer));

  /**
   * @openapi
   * /api/admin/customers/{id}/deactivate:
   *   patch:
   *     tags: [Admin]
   *     summary: Deactivate a customer account
   *     security: [{ bearerAuth: [] }]
   *     parameters:
   *       - $ref: '#/components/parameters/IdParam'
   *     responses:
   *       200:
   *         description: The deactivated customer
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/Customer' }
   *       404: { description: Customer not found }
   */
  router.patch(
    '/customers/:id/deactivate',
    validate(idParamSchema),
    asyncHandler(controller.deactivateCustomer),
  );

  /**
   * @openapi
   * /api/admin/orders:
   *   get:
   *     tags: [Admin]
   *     summary: List all orders across all customers (paginated)
   *     security: [{ bearerAuth: [] }]
   *     parameters:
   *       - $ref: '#/components/parameters/PageParam'
   *       - $ref: '#/components/parameters/LimitParam'
   *     responses:
   *       200:
   *         description: Paginated orders
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/PaginatedOrders' }
   */
  router.get('/orders', validate(paginationSchema), asyncHandler(controller.listOrders));

  /**
   * @openapi
   * /api/admin/orders/{id}/status:
   *   patch:
   *     tags: [Admin]
   *     summary: Update an order's status
   *     security: [{ bearerAuth: [] }]
   *     parameters:
   *       - $ref: '#/components/parameters/IdParam'
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { $ref: '#/components/schemas/UpdateOrderStatusRequest' }
   *     responses:
   *       200:
   *         description: The updated order
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/Order' }
   *       404: { description: Order not found }
   */
  router.patch(
    '/orders/:id/status',
    validate(updateOrderStatusSchema),
    asyncHandler(controller.updateOrderStatus),
  );

  return router;
}
