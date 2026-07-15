import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import { container } from 'tsyringe';
import { TOKENS } from './shared/tokens';
import { ITokenService } from './application/ports/token.port';
import { ILogger } from './application/ports/logger.port';
import { rootLogger } from './infrastructure/logging/pino.logger';
import { createAuthMiddleware } from './presentation/http/middlewares/auth';
import {
  createErrorHandler,
  notFoundHandler,
} from './presentation/http/middlewares/error-handler';
import { mountSwagger } from './presentation/http/docs/swagger';
import { authRoutes } from './presentation/http/routes/auth.routes';
import { customerRoutes } from './presentation/http/routes/customer.routes';
import { orderRoutes } from './presentation/http/routes/order.routes';
import { productRoutes } from './presentation/http/routes/product.routes';
import { adminRoutes } from './presentation/http/routes/admin.routes';

/**
 * Assembles the Express application (no network listen — see server.ts).
 * Kept side-effect-free so tests can import it against an in-memory database.
 * Requires {@link registerDependencies} to have run first.
 */
export function buildApp(): Express {
  const app = express();
  const tokenService = container.resolve<ITokenService>(TOKENS.TokenService);
  const logger = container.resolve<ILogger>(TOKENS.Logger);
  const authenticate = createAuthMiddleware(tokenService);

  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(pinoHttp({ logger: rootLogger }));

  // Basic abuse protection on the API surface (does not throttle Swagger assets).
  app.use(
    '/api',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false }),
  );

  /**
   * @openapi
   * /health:
   *   get:
   *     tags: [Health]
   *     summary: Liveness probe
   *     responses:
   *       200: { description: Service is up }
   */
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  mountSwagger(app);

  app.use('/api/auth', authRoutes());
  app.use('/api/customers', customerRoutes(authenticate));
  app.use('/api/orders', orderRoutes(authenticate));
  app.use('/api/products', productRoutes(authenticate));
  app.use('/api/admin', adminRoutes(authenticate));

  // 404 for anything unmatched, then the global error handler (must be last).
  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return app;
}
