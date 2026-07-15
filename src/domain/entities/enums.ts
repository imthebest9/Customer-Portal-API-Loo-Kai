/** Authorization roles. Admin endpoints require {@link Role.Admin}. */
export enum Role {
  Customer = 'customer',
  Admin = 'admin',
}

/** Lifecycle of an order. Orders may only be cancelled while {@link OrderStatus.Pending}. */
export enum OrderStatus {
  Pending = 'Pending',
  Shipped = 'Shipped',
  Delivered = 'Delivered',
  Cancelled = 'Cancelled',
}

export const ORDER_STATUSES: OrderStatus[] = Object.values(OrderStatus);
