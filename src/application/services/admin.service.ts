import { inject, injectable } from 'tsyringe';
import { ICustomerRepository } from '../../domain/repositories/customer.repository';
import { IOrderRepository } from '../../domain/repositories/order.repository';
import { Order } from '../../domain/entities/models';
import { OrderStatus } from '../../domain/entities/enums';
import { allowedTransitionsFrom, canTransition } from '../../domain/entities/order-status.policy';
import { ConflictError, NotFoundError } from '../../domain/errors/app-error';
import { PaginatedResult, PaginationParams } from '../../domain/repositories/pagination';
import { ICacheService } from '../ports/cache.port';
import { IEmailService } from '../ports/email.port';
import { ILogger } from '../ports/logger.port';
import { CustomerResponse, toCustomerResponse } from '../dtos/customer.dto';
import { cacheKeys } from './cache-keys';
import { TOKENS } from '../../shared/tokens';

@injectable()
export class AdminService {
  constructor(
    @inject(TOKENS.CustomerRepository) private readonly customers: ICustomerRepository,
    @inject(TOKENS.OrderRepository) private readonly orders: IOrderRepository,
    @inject(TOKENS.CacheService) private readonly cache: ICacheService,
    @inject(TOKENS.EmailService) private readonly email: IEmailService,
    @inject(TOKENS.Logger) private readonly logger: ILogger,
  ) {}

  async listCustomers(params: PaginationParams): Promise<PaginatedResult<CustomerResponse>> {
    const page = await this.customers.list(params);
    return { ...page, data: page.data.map(toCustomerResponse) };
  }

  async deleteCustomer(customerId: string): Promise<void> {
    const customer = await this.customers.findById(customerId);
    if (!customer) throw new NotFoundError('Customer not found');
    await this.customers.delete(customerId);
    await this.cache.del(cacheKeys.customer(customerId));
    this.logger.info({ customerId }, 'Customer deleted by admin');
  }

  async deactivateCustomer(customerId: string): Promise<CustomerResponse> {
    const customer = await this.customers.findById(customerId);
    if (!customer) throw new NotFoundError('Customer not found');
    const updated = await this.customers.update(customerId, { isActive: false });
    await this.cache.del(cacheKeys.customer(customerId));
    this.logger.info({ customerId }, 'Customer deactivated by admin');
    return toCustomerResponse(updated);
  }

  async listAllOrders(params: PaginationParams): Promise<PaginatedResult<Order>> {
    return this.orders.listAll(params);
  }

  async updateOrderStatus(orderId: string, status: OrderStatus): Promise<Order> {
    const order = await this.orders.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');

    if (!canTransition(order.status, status)) {
      const allowed = allowedTransitionsFrom(order.status);
      throw new ConflictError(
        order.status === status
          ? `Order is already "${status}"`
          : `An order cannot move from "${order.status}" to "${status}"`,
        {
          from: order.status,
          to: status,
          allowedTransitions: allowed,
        },
      );
    }

    const updated = await this.orders.updateStatus(orderId, status);
    await this.cache.del(cacheKeys.orderStatus(orderId));
    this.logger.info({ orderId, status }, 'Order status updated by admin');

    if (status === OrderStatus.Shipped) {
      await this.notifyOrderShipped(updated);
    }
    return updated;
  }

  private async notifyOrderShipped(order: Order): Promise<void> {
    try {
      const customer = await this.customers.findById(order.customerId);
      if (!customer) return;
      await this.email.send({
        to: customer.email,
        subject: `Your order ${order.id} has shipped`,
        text: `Hi ${customer.name}, good news — your order ${order.id} is on its way!`,
      });
    } catch (err) {
      this.logger.error({ err, orderId: order.id }, 'Failed to send order-shipped email');
    }
  }
}
