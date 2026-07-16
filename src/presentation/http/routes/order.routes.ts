import { RequestHandler, Router } from 'express';
import { container } from 'tsyringe';
import { OrderController } from '../controllers/order.controller';
import { asyncHandler } from '../middlewares/async-handler';
import { validate } from '../middlewares/validate';
import {
  idParamSchema,
  paginationSchema,
  placeOrderSchema,
} from '../../../application/validators/schemas';

/**
 * @openapi
 * tags:
 *   - name: Orders
 *     description: Customer order management
 */
export function orderRoutes(authenticate: RequestHandler): Router {
  const router = Router();
  const controller = container.resolve(OrderController);

  router.use(authenticate);

  /**
   * @openapi
   * /api/orders:
   *   get:
   *     tags: [Orders]
   *     summary: List my orders (paginated)
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
   *   post:
   *     tags: [Orders]
   *     summary: Place a new order
   *     security: [{ bearerAuth: [] }]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { $ref: '#/components/schemas/PlaceOrderRequest' }
   *     responses:
   *       201:
   *         description: Order created
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/Order' }
   *       400: { description: One or more products unavailable }
   *       422: { description: Validation failed — e.g. the same product listed on two lines }
   */
  router.get('/', validate(paginationSchema), asyncHandler(controller.list));
  router.post('/', validate(placeOrderSchema), asyncHandler(controller.place));

  /**
   * @openapi
   * /api/orders/{id}:
   *   get:
   *     tags: [Orders]
   *     summary: Get one of my orders
   *     security: [{ bearerAuth: [] }]
   *     parameters:
   *       - $ref: '#/components/parameters/IdParam'
   *     responses:
   *       200:
   *         description: The order
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/Order' }
   *       403: { description: Not your order }
   *       404: { description: Order not found }
   */
  router.get('/:id', validate(idParamSchema), asyncHandler(controller.getOne));

  /**
   * @openapi
   * /api/orders/{id}/status:
   *   get:
   *     tags: [Orders]
   *     summary: Track the status of one of my orders (cached)
   *     security: [{ bearerAuth: [] }]
   *     parameters:
   *       - $ref: '#/components/parameters/IdParam'
   *     responses:
   *       200:
   *         description: The order status
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status: { $ref: '#/components/schemas/OrderStatus' }
   *       403: { description: Not your order }
   *       404: { description: Order not found }
   */
  router.get('/:id/status', validate(idParamSchema), asyncHandler(controller.status));

  /**
   * @openapi
   * /api/orders/{id}/cancel:
   *   patch:
   *     tags: [Orders]
   *     summary: Cancel one of my orders (only while Pending)
   *     security: [{ bearerAuth: [] }]
   *     parameters:
   *       - $ref: '#/components/parameters/IdParam'
   *     responses:
   *       200:
   *         description: The cancelled order
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/Order' }
   *       409: { description: Order already shipped/delivered/cancelled }
   */
  router.patch('/:id/cancel', validate(idParamSchema), asyncHandler(controller.cancel));

  return router;
}
