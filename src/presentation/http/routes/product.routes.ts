import { RequestHandler, Router } from 'express';
import { container } from 'tsyringe';
import { ProductController } from '../controllers/product.controller';
import { asyncHandler } from '../middlewares/async-handler';
import { validate } from '../middlewares/validate';
import { paginationSchema } from '../../../application/validators/schemas';

/**
 * @openapi
 * tags:
 *   - name: Products
 *     description: Product catalogue (used when placing orders)
 */
export function productRoutes(authenticate: RequestHandler): Router {
  const router = Router();
  const controller = container.resolve(ProductController);

  router.use(authenticate);

  /**
   * @openapi
   * /api/products:
   *   get:
   *     tags: [Products]
   *     summary: List available products (paginated)
   *     security: [{ bearerAuth: [] }]
   *     parameters:
   *       - $ref: '#/components/parameters/PageParam'
   *       - $ref: '#/components/parameters/LimitParam'
   *     responses:
   *       200:
   *         description: Paginated products
   *         content:
   *           application/json:
   *             schema: { $ref: '#/components/schemas/PaginatedProducts' }
   */
  router.get('/', validate(paginationSchema), asyncHandler(controller.list));

  return router;
}
