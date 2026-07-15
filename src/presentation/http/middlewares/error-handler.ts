import { NextFunction, Request, Response } from 'express';
import { AppError, NotFoundError } from '../../../domain/errors/app-error';
import { ILogger } from '../../../application/ports/logger.port';

/** Terminal 404 handler for unmatched routes. */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new NotFoundError(`Route not found: ${req.method} ${req.originalUrl}`));
}

/**
 * Global error-handling middleware. Maps AppErrors onto their status codes and
 * treats everything else as an unexpected 500 (details hidden from clients).
 */
export function createErrorHandler(logger: ILogger) {
  // Express identifies error handlers by their 4-arg signature.
  return (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    if (err instanceof AppError) {
      if (err.statusCode >= 500) {
        logger.error({ err, path: req.originalUrl }, 'Unhandled application error');
      }
      res.status(err.statusCode).json({
        error: {
          name: err.name,
          message: err.message,
          ...(err.details ? { details: err.details } : {}),
        },
      });
      return;
    }

    logger.error({ err, path: req.originalUrl }, 'Unexpected error');
    res.status(500).json({
      error: {
        name: 'InternalServerError',
        message: 'An unexpected error occurred',
      },
    });
  };
}
