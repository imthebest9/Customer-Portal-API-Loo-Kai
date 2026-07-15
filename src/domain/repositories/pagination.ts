/** Normalised pagination request passed from the HTTP layer into repositories. */
export interface PaginationParams {
  page: number; // 1-based
  limit: number;
}

/** Standard paginated envelope returned by listing endpoints. */
export interface PaginatedResult<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function buildPaginatedResult<T>(
  data: T[],
  total: number,
  { page, limit }: PaginationParams,
): PaginatedResult<T> {
  return {
    data,
    page,
    limit,
    total,
    totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
  };
}
