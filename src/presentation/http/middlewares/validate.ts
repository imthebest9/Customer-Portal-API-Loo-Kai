import { NextFunction, Request, Response } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { ValidationError } from '../../../domain/errors/app-error';

/**
 * Validates `{ body, query, params }` against a Zod schema and stores the
 * parsed/normalised result on `req.validated`. On failure, throws a 422
 * ValidationError carrying field-level details for the error handler.
 */
export function validate(schema: AnyZodObject) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse({
        body: req.body ?? {},
        query: req.query ?? {},
        params: req.params ?? {},
      }) as Partial<{
        body: Record<string, unknown>;
        query: Record<string, unknown>;
        params: Record<string, unknown>;
      }>;

      req.validated = {
        body: parsed.body ?? {},
        query: parsed.query ?? {},
        params: parsed.params ?? {},
      };
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.issues.map((i) => ({
          field: i.path.filter((p) => p !== 'body' && p !== 'query' && p !== 'params').join('.'),
          message: i.message,
        }));
        next(new ValidationError('Validation failed', details));
        return;
      }
      next(err);
    }
  };
}
