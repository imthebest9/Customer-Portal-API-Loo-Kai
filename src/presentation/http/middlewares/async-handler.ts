import { NextFunction, Request, Response, RequestHandler } from 'express';

/**
 * Wraps an async route handler so any rejected promise is forwarded to the
 * central error handler instead of crashing the process.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
