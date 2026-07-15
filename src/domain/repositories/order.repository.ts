import { Order, OrderItem } from '../entities/models';
import { OrderStatus } from '../entities/enums';
import { PaginatedResult, PaginationParams } from './pagination';

export type NewOrderItem = Omit<OrderItem, 'id'>;

export interface NewOrder {
  customerId: string;
  status: OrderStatus;
  totalAmount: number;
  items: NewOrderItem[];
}

/** Persistence-agnostic contract for order storage. */
export interface IOrderRepository {
  create(data: NewOrder): Promise<Order>;
  findById(id: string): Promise<Order | null>;
  updateStatus(id: string, status: OrderStatus): Promise<Order>;
  listByCustomer(
    customerId: string,
    params: PaginationParams,
  ): Promise<PaginatedResult<Order>>;
  listAll(params: PaginationParams): Promise<PaginatedResult<Order>>;
}
