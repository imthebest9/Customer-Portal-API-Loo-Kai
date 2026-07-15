import { inject, injectable } from 'tsyringe';
import { ICustomerRepository } from '../../domain/repositories/customer.repository';
import { NotFoundError, UnauthorizedError } from '../../domain/errors/app-error';
import { IHasher } from '../ports/hasher.port';
import { ICacheService } from '../ports/cache.port';
import { ILogger } from '../ports/logger.port';
import { CustomerResponse, toCustomerResponse } from '../dtos/customer.dto';
import { cacheKeys } from './cache-keys';
import { TOKENS } from '../../shared/tokens';

export interface UpdateProfileInput {
  name?: string;
  phone?: string | null;
  address?: string | null;
}

@injectable()
export class CustomerService {
  constructor(
    @inject(TOKENS.CustomerRepository) private readonly customers: ICustomerRepository,
    @inject(TOKENS.Hasher) private readonly hasher: IHasher,
    @inject(TOKENS.CacheService) private readonly cache: ICacheService,
    @inject(TOKENS.Logger) private readonly logger: ILogger,
  ) {}

  /** Profile read — served from cache when available (bonus: caching). */
  async getProfile(customerId: string): Promise<CustomerResponse> {
    const cached = await this.cache.get<CustomerResponse>(cacheKeys.customer(customerId));
    if (cached) return cached;

    const customer = await this.customers.findById(customerId);
    if (!customer) throw new NotFoundError('Customer not found');

    const response = toCustomerResponse(customer);
    await this.cache.set(cacheKeys.customer(customerId), response);
    return response;
  }

  async updateProfile(customerId: string, input: UpdateProfileInput): Promise<CustomerResponse> {
    const customer = await this.customers.findById(customerId);
    if (!customer) throw new NotFoundError('Customer not found');

    const updated = await this.customers.update(customerId, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
    });

    await this.cache.del(cacheKeys.customer(customerId));
    this.logger.info({ customerId }, 'Customer profile updated');
    return toCustomerResponse(updated);
  }

  async changePassword(
    customerId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const customer = await this.customers.findById(customerId);
    if (!customer) throw new NotFoundError('Customer not found');

    const matches = await this.hasher.compare(currentPassword, customer.passwordHash);
    if (!matches) {
      throw new UnauthorizedError('Current password is incorrect');
    }

    const passwordHash = await this.hasher.hash(newPassword);
    await this.customers.update(customerId, { passwordHash });
    await this.cache.del(cacheKeys.customer(customerId));
    this.logger.info({ customerId }, 'Customer password changed');
  }
}
