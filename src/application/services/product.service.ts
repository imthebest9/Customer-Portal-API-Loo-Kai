import { inject, injectable } from 'tsyringe';
import { IProductRepository } from '../../domain/repositories/product.repository';
import { Product } from '../../domain/entities/models';
import { PaginatedResult, PaginationParams } from '../../domain/repositories/pagination';
import { TOKENS } from '../../shared/tokens';

@injectable()
export class ProductService {
  constructor(
    @inject(TOKENS.ProductRepository) private readonly products: IProductRepository,
  ) {}

  async list(params: PaginationParams): Promise<PaginatedResult<Product>> {
    return this.products.list(params);
  }
}
