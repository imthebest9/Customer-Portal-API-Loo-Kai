import { randomUUID } from 'node:crypto';
import { Customer, Order, Product } from '../../src/domain/entities/models';
import { OrderStatus } from '../../src/domain/entities/enums';
import {
  CustomerUpdate,
  ICustomerRepository,
  NewCustomer,
} from '../../src/domain/repositories/customer.repository';
import {
  IOrderRepository,
  NewOrder,
} from '../../src/domain/repositories/order.repository';
import { IProductRepository } from '../../src/domain/repositories/product.repository';
import {
  buildPaginatedResult,
  PaginatedResult,
  PaginationParams,
} from '../../src/domain/repositories/pagination';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

function paginate<T>(rows: T[], params: PaginationParams): PaginatedResult<T> {
  const start = (params.page - 1) * params.limit;
  return buildPaginatedResult(rows.slice(start, start + params.limit), rows.length, params);
}

export class InMemoryCustomerRepository implements ICustomerRepository {
  private readonly items = new Map<string, Customer>();

  async create(data: NewCustomer): Promise<Customer> {
    const now = new Date();
    const customer: Customer = { id: randomUUID(), ...data, createdAt: now, updatedAt: now };
    this.items.set(customer.id, customer);
    return clone(customer);
  }
  async findById(id: string): Promise<Customer | null> {
    const found = this.items.get(id);
    return found ? clone(found) : null;
  }
  async findByEmail(email: string): Promise<Customer | null> {
    const found = [...this.items.values()].find((c) => c.email === email.toLowerCase());
    return found ? clone(found) : null;
  }
  async update(id: string, changes: CustomerUpdate): Promise<Customer> {
    const existing = this.items.get(id);
    if (!existing) throw new Error('Customer not found');
    const updated: Customer = { ...existing, ...changes, updatedAt: new Date() };
    this.items.set(id, updated);
    return clone(updated);
  }
  async delete(id: string): Promise<void> {
    this.items.delete(id);
  }
  async list(params: PaginationParams): Promise<PaginatedResult<Customer>> {
    const rows = [...this.items.values()].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
    return paginate(rows.map(clone), params);
  }
}

export class InMemoryProductRepository implements IProductRepository {
  private readonly items = new Map<string, Product>();

  seed(products: Array<{ name: string; price: number }>): Product[] {
    return products.map((p) => {
      const now = new Date();
      const product: Product = {
        id: randomUUID(),
        name: p.name,
        price: p.price,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };
      this.items.set(product.id, product);
      return clone(product);
    });
  }
  async findById(id: string): Promise<Product | null> {
    const found = this.items.get(id);
    return found ? clone(found) : null;
  }
  async findByIds(ids: string[]): Promise<Product[]> {
    return ids
      .map((id) => this.items.get(id))
      .filter((p): p is Product => Boolean(p))
      .map(clone);
  }
  async list(params: PaginationParams): Promise<PaginatedResult<Product>> {
    const rows = [...this.items.values()]
      .filter((p) => p.isActive)
      .sort((a, b) => a.name.localeCompare(b.name));
    return paginate(rows.map(clone), params);
  }
}

export class InMemoryOrderRepository implements IOrderRepository {
  private readonly items = new Map<string, Order>();

  async create(data: NewOrder): Promise<Order> {
    const now = new Date();
    const order: Order = {
      id: randomUUID(),
      customerId: data.customerId,
      status: data.status,
      totalAmount: data.totalAmount,
      items: data.items.map((i) => ({ id: randomUUID(), ...i })),
      createdAt: now,
      updatedAt: now,
    };
    this.items.set(order.id, order);
    return clone(order);
  }
  async findById(id: string): Promise<Order | null> {
    const found = this.items.get(id);
    return found ? clone(found) : null;
  }
  async updateStatus(id: string, status: OrderStatus): Promise<Order> {
    const existing = this.items.get(id);
    if (!existing) throw new Error('Order not found');
    const updated: Order = { ...existing, status, updatedAt: new Date() };
    this.items.set(id, updated);
    return clone(updated);
  }
  async listByCustomer(
    customerId: string,
    params: PaginationParams,
  ): Promise<PaginatedResult<Order>> {
    const rows = [...this.items.values()]
      .filter((o) => o.customerId === customerId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return paginate(rows.map(clone), params);
  }
  async listAll(params: PaginationParams): Promise<PaginatedResult<Order>> {
    const rows = [...this.items.values()].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
    return paginate(rows.map(clone), params);
  }
}
