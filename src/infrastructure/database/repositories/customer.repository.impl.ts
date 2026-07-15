import { DataSource, Repository } from 'typeorm';
import { inject, injectable } from 'tsyringe';
import {
  CustomerUpdate,
  ICustomerRepository,
  NewCustomer,
} from '../../../domain/repositories/customer.repository';
import { Customer } from '../../../domain/entities/models';
import {
  buildPaginatedResult,
  PaginatedResult,
  PaginationParams,
} from '../../../domain/repositories/pagination';
import { TOKENS } from '../../../shared/tokens';
import { CustomerEntity } from '../entities/customer.entity';
import { toCustomer } from './mappers';

@injectable()
export class TypeOrmCustomerRepository implements ICustomerRepository {
  private readonly repo: Repository<CustomerEntity>;

  constructor(@inject(TOKENS.DataSource) dataSource: DataSource) {
    this.repo = dataSource.getRepository(CustomerEntity);
  }

  async create(data: NewCustomer): Promise<Customer> {
    const entity = this.repo.create(data);
    const saved = await this.repo.save(entity);
    return toCustomer(saved);
  }

  async findById(id: string): Promise<Customer | null> {
    const entity = await this.repo.findOne({ where: { id } });
    return entity ? toCustomer(entity) : null;
  }

  async findByEmail(email: string): Promise<Customer | null> {
    const entity = await this.repo.findOne({ where: { email: email.toLowerCase() } });
    return entity ? toCustomer(entity) : null;
  }

  async update(id: string, changes: CustomerUpdate): Promise<Customer> {
    await this.repo.update({ id }, changes);
    const updated = await this.repo.findOneOrFail({ where: { id } });
    return toCustomer(updated);
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete({ id });
  }

  async list(params: PaginationParams): Promise<PaginatedResult<Customer>> {
    const [rows, total] = await this.repo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    });
    return buildPaginatedResult(rows.map(toCustomer), total, params);
  }
}
