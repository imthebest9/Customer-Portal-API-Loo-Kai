import { Customer, Order, OrderItem, Product } from '../../../domain/entities/models';
import { CustomerEntity } from '../entities/customer.entity';
import { OrderEntity } from '../entities/order.entity';
import { OrderItemEntity } from '../entities/order-item.entity';
import { ProductEntity } from '../entities/product.entity';

/** Pure functions mapping persistence entities onto framework-free domain models. */

export function toCustomer(e: CustomerEntity): Customer {
  return {
    id: e.id,
    name: e.name,
    email: e.email,
    passwordHash: e.passwordHash,
    role: e.role,
    phone: e.phone,
    address: e.address,
    isActive: e.isActive,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

export function toProduct(e: ProductEntity): Product {
  return {
    id: e.id,
    name: e.name,
    price: e.price,
    isActive: e.isActive,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

export function toOrderItem(e: OrderItemEntity): OrderItem {
  return {
    id: e.id,
    productId: e.productId,
    productName: e.productName,
    quantity: e.quantity,
    unitPrice: e.unitPrice,
  };
}

export function toOrder(e: OrderEntity): Order {
  return {
    id: e.id,
    customerId: e.customerId,
    status: e.status,
    totalAmount: e.totalAmount,
    items: (e.items ?? []).map(toOrderItem),
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}
