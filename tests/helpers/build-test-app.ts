import { Express } from 'express';
import { container } from 'tsyringe';
import { config } from '../../src/infrastructure/config/env';
import { TOKENS } from '../../src/shared/tokens';
import { Role } from '../../src/domain/entities/enums';
import { Customer, Product } from '../../src/domain/entities/models';
import { PinoLogger } from '../../src/infrastructure/logging/pino.logger';
import { BcryptHasher } from '../../src/infrastructure/security/bcrypt.hasher';
import { JwtTokenService } from '../../src/infrastructure/security/jwt.token.service';
import { MemoryCacheService } from '../../src/infrastructure/cache/memory.cache';
import { RecordingEmailService } from '../fakes/recording-email.service';
import { buildApp } from '../../src/app';
import {
  InMemoryCustomerRepository,
  InMemoryOrderRepository,
  InMemoryProductRepository,
} from '../fakes/in-memory-repositories';

export interface TestContext {
  app: Express;
  customerRepo: InMemoryCustomerRepository;
  productRepo: InMemoryProductRepository;
  orderRepo: InMemoryOrderRepository;
  emails: RecordingEmailService;
  admin: Customer;
  products: Product[];
}

/**
 * Builds the real Express app wired to in-memory repositories via the same DI
 * tokens the production composition root uses. No database engine is involved —
 * this is possible precisely because business logic depends on repository
 * interfaces, not TypeORM.
 */
export async function buildTestApp(): Promise<TestContext> {
  container.reset();

  const logger = new PinoLogger();
  container.registerInstance(TOKENS.Config, config);
  container.registerInstance(TOKENS.Logger, logger);
  container.register(TOKENS.Hasher, { useClass: BcryptHasher });
  container.register(TOKENS.TokenService, { useClass: JwtTokenService });
  container.registerInstance(TOKENS.CacheService, new MemoryCacheService(config.CACHE_TTL_SECONDS));
  const emails = new RecordingEmailService();
  container.registerInstance(TOKENS.EmailService, emails);

  const customerRepo = new InMemoryCustomerRepository();
  const productRepo = new InMemoryProductRepository();
  const orderRepo = new InMemoryOrderRepository();
  container.registerInstance(TOKENS.CustomerRepository, customerRepo);
  container.registerInstance(TOKENS.OrderRepository, orderRepo);
  container.registerInstance(TOKENS.ProductRepository, productRepo);

  const hasher = new BcryptHasher();
  const admin = await customerRepo.create({
    name: config.ADMIN_NAME,
    email: config.ADMIN_EMAIL,
    passwordHash: await hasher.hash(config.ADMIN_PASSWORD),
    role: Role.Admin,
    phone: null,
    address: null,
    isActive: true,
  });

  const products = productRepo.seed([
    { name: 'Widget', price: 10 },
    { name: 'Gadget', price: 20.5 },
  ]);

  return { app: buildApp(), customerRepo, productRepo, orderRepo, emails, admin, products };
}
