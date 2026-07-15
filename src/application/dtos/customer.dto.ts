import { Customer } from '../../domain/entities/models';
import { Role } from '../../domain/entities/enums';

/** Public representation of a customer — never exposes the password hash. */
export interface CustomerResponse {
  id: string;
  name: string;
  email: string;
  role: Role;
  phone: string | null;
  address: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export function toCustomerResponse(customer: Customer): CustomerResponse {
  return {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    role: customer.role,
    phone: customer.phone,
    address: customer.address,
    isActive: customer.isActive,
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
  };
}
