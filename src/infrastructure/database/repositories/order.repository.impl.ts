import { DataSource, Repository } from 'typeorm';
import { inject, injectable } from 'tsyringe';
import {
  IOrderRepository,
  NewOrder,
} from '../../../domain/repositories/order.repository';
import { Order } from '../../../domain/entities/models';
import { OrderStatus } from '../../../domain/entities/enums';
import {
  buildPaginatedResult,
  PaginatedResult,
  PaginationParams,
} from '../../../domain/repositories/pagination';
import { TOKENS } from '../../../shared/tokens';
import { OrderEntity } from '../entities/order.entity';
import { OrderItemEntity } from '../entities/order-item.entity';
import { toOrder } from './mappers';

@injectable()
export class TypeOrmOrderRepository implements IOrderRepository {
  private readonly repo: Repository<OrderEntity>;

  constructor(@inject(TOKENS.DataSource) dataSource: DataSource) {
    this.repo = dataSource.getRepository(OrderEntity);
  }

  async create(data: NewOrder): Promise<Order> {
    const order = this.repo.create({
      customerId: data.customerId,
      status: data.status,
      totalAmount: data.totalAmount,
      items: data.items.map((i) => {
        const item = new OrderItemEntity();
        item.productId = i.productId;
        item.productName = i.productName;
        item.quantity = i.quantity;
        item.unitPrice = i.unitPrice;
        return item;
      }),
    });
    const saved = await this.repo.save(order);
    // Reload to guarantee items (with generated ids) are present.
    const reloaded = await this.repo.findOneOrFail({ where: { id: saved.id } });
    return toOrder(reloaded);
  }

  async findById(id: string): Promise<Order | null> {
    const entity = await this.repo.findOne({ where: { id } });
    return entity ? toOrder(entity) : null;
  }

  async updateStatus(id: string, status: OrderStatus): Promise<Order> {
    await this.repo.update({ id }, { status });
    const updated = await this.repo.findOneOrFail({ where: { id } });
    return toOrder(updated);
  }

  async listByCustomer(
    customerId: string,
    params: PaginationParams,
  ): Promise<PaginatedResult<Order>> {
    const [rows, total] = await this.repo.findAndCount({
      where: { customerId },
      order: { createdAt: 'DESC' },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    });
    return buildPaginatedResult(rows.map(toOrder), total, params);
  }

  async listAll(params: PaginationParams): Promise<PaginatedResult<Order>> {
    const [rows, total] = await this.repo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    });
    return buildPaginatedResult(rows.map(toOrder), total, params);
  }
}
