import { Customer } from '../entities/models';
import { PaginatedResult, PaginationParams } from './pagination';

export type NewCustomer = Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>;
export type CustomerUpdate = Partial<
  Pick<Customer, 'name' | 'phone' | 'address' | 'passwordHash' | 'isActive'>
>;

/**
 * Persistence-agnostic contract for customer storage. The application layer
 * depends only on this interface; the TypeORM implementation lives in the
 * infrastructure layer.
 */
export interface ICustomerRepository {
  create(data: NewCustomer): Promise<Customer>;
  findById(id: string): Promise<Customer | null>;
  findByEmail(email: string): Promise<Customer | null>;
  update(id: string, changes: CustomerUpdate): Promise<Customer>;
  delete(id: string): Promise<void>;
  list(params: PaginationParams): Promise<PaginatedResult<Customer>>;
}
