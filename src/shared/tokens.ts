/**
 * Injection tokens for interface-typed dependencies.
 *
 * TypeScript interfaces do not exist at runtime, so tsyringe cannot resolve them
 * by type. We register/resolve these abstractions via stable string tokens.
 */
export const TOKENS = {
  Logger: 'ILogger',
  Hasher: 'IHasher',
  TokenService: 'ITokenService',
  CacheService: 'ICacheService',
  EmailService: 'IEmailService',
  CustomerRepository: 'ICustomerRepository',
  OrderRepository: 'IOrderRepository',
  ProductRepository: 'IProductRepository',
  Config: 'AppConfig',
  DataSource: 'DataSource',
} as const;
