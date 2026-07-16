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
        const details = err.issues.flatMap((i) => {
          const field = i.path
            .filter((p) => p !== 'body' && p !== 'query' && p !== 'params')
            .join('.');

          // Zod reports an unknown key against the *parent* object, leaving the
          // path empty — which would surface as `"field": ""`. Name the offending
          // keys instead, one detail each, so the client learns what to remove.
          if (i.code === 'unrecognized_keys') {
            return i.keys.map((key) => ({
              field: field ? `${field}.${key}` : key,
              message: `Unrecognized field: ${key}`,
            }));
          }

          return [{ field, message: i.message }];
        });
        next(new ValidationError('Validation failed', details));
        return;
      }
      next(err);
    }
  };
}
