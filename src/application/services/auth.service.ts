import { inject, injectable } from 'tsyringe';
import { ICustomerRepository } from '../../domain/repositories/customer.repository';
import { Role } from '../../domain/entities/enums';
import { ConflictError, UnauthorizedError } from '../../domain/errors/app-error';
import { IHasher } from '../ports/hasher.port';
import { ITokenService } from '../ports/token.port';
import { ILogger } from '../ports/logger.port';
import { CustomerResponse, toCustomerResponse } from '../dtos/customer.dto';
import { TOKENS } from '../../shared/tokens';

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  phone?: string;
  address?: string;
}

export interface AuthResult {
  customer: CustomerResponse;
  token: string;
}

@injectable()
export class AuthService {
  constructor(
    @inject(TOKENS.CustomerRepository) private readonly customers: ICustomerRepository,
    @inject(TOKENS.Hasher) private readonly hasher: IHasher,
    @inject(TOKENS.TokenService) private readonly tokens: ITokenService,
    @inject(TOKENS.Logger) private readonly logger: ILogger,
  ) {}

  async register(input: RegisterInput): Promise<AuthResult> {
    const existing = await this.customers.findByEmail(input.email);
    if (existing) {
      throw new ConflictError('An account with this email already exists');
    }

    const passwordHash = await this.hasher.hash(input.password);
    const customer = await this.customers.create({
      name: input.name,
      email: input.email,
      passwordHash,
      role: Role.Customer,
      phone: input.phone ?? null,
      address: input.address ?? null,
      isActive: true,
    });

    this.logger.info({ customerId: customer.id, email: customer.email }, 'Customer registered');
    return { customer: toCustomerResponse(customer), token: this.issueToken(customer.id, customer.email, customer.role) };
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const customer = await this.customers.findByEmail(email);
    // Uniform error to avoid leaking which part failed (user enumeration).
    if (!customer || !customer.isActive) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const passwordMatches = await this.hasher.compare(password, customer.passwordHash);
    if (!passwordMatches) {
      this.logger.warn({ email }, 'Failed login attempt');
      throw new UnauthorizedError('Invalid credentials');
    }

    this.logger.info({ customerId: customer.id, email: customer.email }, 'Customer logged in');
    return {
      customer: toCustomerResponse(customer),
      token: this.issueToken(customer.id, customer.email, customer.role),
    };
  }

  private issueToken(sub: string, email: string, role: Role): string {
    return this.tokens.sign({ sub, email, role });
  }
}
