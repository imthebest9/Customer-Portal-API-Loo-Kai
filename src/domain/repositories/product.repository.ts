import { Product } from '../entities/models';
import { PaginatedResult, PaginationParams } from './pagination';

export interface IProductRepository {
  findById(id: string): Promise<Product | null>;
  findByIds(ids: string[]): Promise<Product[]>;
  list(params: PaginationParams): Promise<PaginatedResult<Product>>;
}
