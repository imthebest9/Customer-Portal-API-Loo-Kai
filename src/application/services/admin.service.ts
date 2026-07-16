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
import { EmailMessage } from '../ports/email.port';
import {
  orderCancelledEmail,
  orderDeliveredEmail,
  orderShippedEmail,
} from '../email/order-emails';
import { cacheKeys } from './cache-keys';
import { TOKENS } from '../../shared/tokens';

type OrderEmailTemplate = (customerName: string, to: string, order: Order) => EmailMessage;

/**
 * Which statuses are worth emailing about, and what to say. `Pending` has no
 * entry: an order only reaches it at creation, which OrderService already
 * confirms by email.
 */
const STATUS_EMAILS: Partial<Record<OrderStatus, OrderEmailTemplate>> = {
  [OrderStatus.Shipped]: orderShippedEmail,
  [OrderStatus.Delivered]: orderDeliveredEmail,
  [OrderStatus.Cancelled]: orderCancelledEmail,
};

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

    await this.notifyStatusChange(updated, status);
    return updated;
  }

  /**
   * Emails the customer about a status change, where the new status has something
   * worth saying. Driven by a lookup rather than a chain of ifs: adding a
   * notification for a future status is one entry in {@link STATUS_EMAILS}, and a
   * status with no entry simply stays quiet.
   */
  private async notifyStatusChange(order: Order, status: OrderStatus): Promise<void> {
    const template = STATUS_EMAILS[status];
    if (!template) return;

    try {
      const customer = await this.customers.findById(order.customerId);
      if (!customer) return;
      await this.email.send(template(customer.name, customer.email, order));
    } catch (err) {
      // Notifications must never fail the status update that triggered them.
      this.logger.error({ err, orderId: order.id, status }, 'Failed to send order status email');
    }
  }
}
