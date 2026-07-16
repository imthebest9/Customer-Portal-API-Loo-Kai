import { inject, injectable } from 'tsyringe';
import { IOrderRepository, NewOrderItem } from '../../domain/repositories/order.repository';
import { IProductRepository } from '../../domain/repositories/product.repository';
import { ICustomerRepository } from '../../domain/repositories/customer.repository';
import { Order } from '../../domain/entities/models';
import { OrderStatus } from '../../domain/entities/enums';
import { canTransition } from '../../domain/entities/order-status.policy';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../domain/errors/app-error';
import { PaginatedResult, PaginationParams } from '../../domain/repositories/pagination';
import { ICacheService } from '../ports/cache.port';
import { IEmailService } from '../ports/email.port';
import { ILogger } from '../ports/logger.port';
import { cacheKeys } from './cache-keys';
import { TOKENS } from '../../shared/tokens';

export interface PlaceOrderItemInput {
  productId: string;
  quantity: number;
}

/** Cache entry for {@link OrderService.getStatus}. */
interface CachedOrderStatus {
  status: OrderStatus;
  customerId: string;
}

@injectable()
export class OrderService {
  constructor(
    @inject(TOKENS.OrderRepository) private readonly orders: IOrderRepository,
    @inject(TOKENS.ProductRepository) private readonly products: IProductRepository,
    @inject(TOKENS.CustomerRepository) private readonly customers: ICustomerRepository,
    @inject(TOKENS.CacheService) private readonly cache: ICacheService,
    @inject(TOKENS.EmailService) private readonly email: IEmailService,
    @inject(TOKENS.Logger) private readonly logger: ILogger,
  ) {}

  async placeOrder(customerId: string, itemsInput: PlaceOrderItemInput[]): Promise<Order> {
    const productIds = [...new Set(itemsInput.map((i) => i.productId))];
    const products = await this.products.findByIds(productIds);
    const productById = new Map(products.map((p) => [p.id, p]));

    const items: NewOrderItem[] = [];
    let total = 0;
    for (const line of itemsInput) {
      const product = productById.get(line.productId);
      if (!product || !product.isActive) {
        throw new BadRequestError(`Product ${line.productId} is unavailable`);
      }
      const lineTotal = product.price * line.quantity;
      total += lineTotal;
      items.push({
        productId: product.id,
        productName: product.name,
        quantity: line.quantity,
        unitPrice: product.price,
      });
    }

    const order = await this.orders.create({
      customerId,
      status: OrderStatus.Pending,
      totalAmount: Number(total.toFixed(2)),
      items,
    });

    this.logger.info({ orderId: order.id, customerId, total: order.totalAmount }, 'Order placed');
    await this.notifyOrderPlaced(customerId, order);
    return order;
  }

  /** Returns an order, or throws unless the caller owns it. */
  async getOrderForCustomer(customerId: string, orderId: string): Promise<Order> {
    const order = await this.orders.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');
    if (order.customerId !== customerId) {
      throw new ForbiddenError('You do not have access to this order');
    }
    return order;
  }

  async listMyOrders(
    customerId: string,
    params: PaginationParams,
  ): Promise<PaginatedResult<Order>> {
    return this.orders.listByCustomer(customerId, params);
  }

  async cancelOrder(customerId: string, orderId: string): Promise<Order> {
    const order = await this.getOrderForCustomer(customerId, orderId);
    // Can only cancel while not yet shipped; the lifecycle policy is the single
    // source of truth, shared with the admin status-update path.
    if (!canTransition(order.status, OrderStatus.Cancelled)) {
      throw new ConflictError(
        `Order cannot be cancelled while its status is "${order.status}"`,
      );
    }

    const updated = await this.orders.updateStatus(orderId, OrderStatus.Cancelled);
    await this.cache.del(cacheKeys.orderStatus(orderId));
    this.logger.info({ orderId, customerId }, 'Order cancelled');
    return updated;
  }

  /**
   * Cached read of an order's status (bonus: caching). The owner is cached
   * alongside the status so ownership can still be enforced on a hit without
   * re-reading the order — otherwise the cache would save no work at all.
   */
  async getStatus(customerId: string, orderId: string): Promise<{ status: OrderStatus }> {
    const key = cacheKeys.orderStatus(orderId);
    const cached = await this.cache.get<CachedOrderStatus>(key);
    if (cached) {
      if (cached.customerId !== customerId) {
        throw new ForbiddenError('You do not have access to this order');
      }
      return { status: cached.status };
    }

    const order = await this.getOrderForCustomer(customerId, orderId);
    await this.cache.set(key, { status: order.status, customerId: order.customerId });
    return { status: order.status };
  }

  private async notifyOrderPlaced(customerId: string, order: Order): Promise<void> {
    try {
      const customer = await this.customers.findById(customerId);
      if (!customer) return;
      await this.email.send({
        to: customer.email,
        subject: `Order ${order.id} received`,
        text: `Hi ${customer.name}, we've received your order for a total of $${order.totalAmount}. Current status: ${order.status}.`,
      });
    } catch (err) {
      // Notifications must never fail the order transaction.
      this.logger.error({ err, orderId: order.id }, 'Failed to send order-placed email');
    }
  }
}
