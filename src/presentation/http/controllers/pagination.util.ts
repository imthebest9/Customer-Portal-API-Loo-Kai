import { Request } from 'express';
import { PaginationParams } from '../../../domain/repositories/pagination';

/** Reads the Zod-validated `page`/`limit` from `req.validated.query`. */
export function getPagination(req: Request): PaginationParams {
  const query = (req.validated?.query ?? {}) as { page?: number; limit?: number };
  return {
    page: query.page ?? 1,
    limit: query.limit ?? 10,
  };
}
