import 'reflect-metadata';
import { container, DependencyContainer } from 'tsyringe';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import { AppConfig, config as defaultConfig } from './infrastructure/config/env';
import { AppDataSource } from './infrastructure/database/data-source';
import { TOKENS } from './shared/tokens';
import { PinoLogger } from './infrastructure/logging/pino.logger';
import { BcryptHasher } from './infrastructure/security/bcrypt.hasher';
import { JwtTokenService } from './infrastructure/security/jwt.token.service';
import { MemoryCacheService } from './infrastructure/cache/memory.cache';
import { RedisCacheService } from './infrastructure/cache/redis.cache';
import { NodemailerEmailService } from './infrastructure/email/nodemailer.email.service';
import { TypeOrmCustomerRepository } from './infrastructure/database/repositories/customer.repository.impl';
import { TypeOrmOrderRepository } from './infrastructure/database/repositories/order.repository.impl';
import { TypeOrmProductRepository } from './infrastructure/database/repositories/product.repository.impl';
import { ICacheService } from './application/ports/cache.port';

export interface ContainerOptions {
  dataSource?: DataSource;
  config?: AppConfig;
}

/**
 * Composition root. Binds every interface (port/repository) to its concrete
 * implementation. This is the only place the layers are wired together —
 * everything else depends on abstractions (Dependency Inversion).
 */
export function registerDependencies(opts: ContainerOptions = {}): DependencyContainer {
  const cfg = opts.config ?? defaultConfig;
  const dataSource = opts.dataSource ?? AppDataSource;

  container.registerInstance<AppConfig>(TOKENS.Config, cfg);
  container.registerInstance<DataSource>(TOKENS.DataSource, dataSource);

  const logger = new PinoLogger();
  container.registerInstance(TOKENS.Logger, logger);

  container.register(TOKENS.Hasher, { useClass: BcryptHasher });
  container.register(TOKENS.TokenService, { useClass: JwtTokenService });

  const cache: ICacheService =
    cfg.CACHE_DRIVER === 'redis'
      ? new RedisCacheService(new Redis(cfg.REDIS_URL), cfg.CACHE_TTL_SECONDS)
      : new MemoryCacheService(cfg.CACHE_TTL_SECONDS);
  container.registerInstance(TOKENS.CacheService, cache);

  container.registerInstance(TOKENS.EmailService, new NodemailerEmailService(cfg, logger));

  container.register(TOKENS.CustomerRepository, { useClass: TypeOrmCustomerRepository });
  container.register(TOKENS.OrderRepository, { useClass: TypeOrmOrderRepository });
  container.register(TOKENS.ProductRepository, { useClass: TypeOrmProductRepository });

  return container;
}

export { container };
