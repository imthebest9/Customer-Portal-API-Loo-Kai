import { OrderStatus, Role } from './enums';

/**
 * Plain domain models. These describe the shape of business entities used by the
 * application (service) layer. They are intentionally free of any ORM/framework
 * concerns — the infrastructure layer maps persistence entities onto these shapes.
 */

export interface Customer {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  phone: string | null;
  address: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

export interface Order {
  id: string;
  customerId: string;
  status: OrderStatus;
  totalAmount: number;
  items: OrderItem[];
  createdAt: Date;
  updatedAt: Date;
}
