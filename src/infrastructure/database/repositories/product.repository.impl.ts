import { DataSource, In, Repository } from 'typeorm';
import { inject, injectable } from 'tsyringe';
import { IProductRepository } from '../../../domain/repositories/product.repository';
import { Product } from '../../../domain/entities/models';
import {
  buildPaginatedResult,
  PaginatedResult,
  PaginationParams,
} from '../../../domain/repositories/pagination';
import { TOKENS } from '../../../shared/tokens';
import { ProductEntity } from '../entities/product.entity';
import { toProduct } from './mappers';

@injectable()
export class TypeOrmProductRepository implements IProductRepository {
  private readonly repo: Repository<ProductEntity>;

  constructor(@inject(TOKENS.DataSource) dataSource: DataSource) {
    this.repo = dataSource.getRepository(ProductEntity);
  }

  async findById(id: string): Promise<Product | null> {
    const entity = await this.repo.findOne({ where: { id } });
    return entity ? toProduct(entity) : null;
  }

  async findByIds(ids: string[]): Promise<Product[]> {
    if (ids.length === 0) return [];
    const rows = await this.repo.find({ where: { id: In(ids) } });
    return rows.map(toProduct);
  }

  async list(params: PaginationParams): Promise<PaginatedResult<Product>> {
    const [rows, total] = await this.repo.findAndCount({
      where: { isActive: true },
      order: { name: 'ASC' },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    });
    return buildPaginatedResult(rows.map(toProduct), total, params);
  }
}
