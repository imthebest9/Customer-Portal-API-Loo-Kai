import { NextFunction, Request, Response } from 'express';
import {
  AppError,
  BadRequestError,
  NotFoundError,
  PayloadTooLargeError,
} from '../../../domain/errors/app-error';
import { ILogger } from '../../../application/ports/logger.port';

/** Terminal 404 handler for unmatched routes. */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new NotFoundError(`Route not found: ${req.method} ${req.originalUrl}`));
}

/**
 * Shape of the errors body-parser throws for input it rejects before any route
 * runs — malformed JSON, a non-object body, an oversized payload.
 */
interface BodyParserError {
  type?: string;
  status?: number;
  statusCode?: number;
  expose?: boolean;
}

/**
 * Recognises a body-parser rejection and restates it as an {@link AppError}.
 *
 * Without this these surface as unexpected 500s: the request never reaches the
 * `validate` middleware, so Zod never sees it. A client sending broken JSON has
 * made a client error, and saying "internal server error" both misleads them and
 * buries a genuine server fault in noise. Only `expose`d 4xx statuses are
 * trusted — anything else stays a 500.
 */
function asClientError(err: unknown): AppError | null {
  if (typeof err !== 'object' || err === null) return null;
  const e = err as BodyParserError;
  const status = e.status ?? e.statusCode;
  if (typeof status !== 'number' || status < 400 || status >= 500 || e.expose !== true) {
    return null;
  }
  switch (e.type) {
    case 'entity.parse.failed':
      return new BadRequestError('Malformed JSON in request body');
    case 'entity.too.large':
      return new PayloadTooLargeError();
    case 'encoding.unsupported':
      return new BadRequestError('Unsupported content encoding');
    default:
      return new BadRequestError('Invalid request body');
  }
}

/**
 * Global error-handling middleware. Maps AppErrors onto their status codes and
 * treats everything else as an unexpected 500 (details hidden from clients).
 */
export function createErrorHandler(logger: ILogger) {
  // Express identifies error handlers by their 4-arg signature.
  return (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    const clientError = asClientError(err);
    if (clientError) err = clientError;

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
