import path from 'node:path';
import { DataSource } from 'typeorm';
import { config } from '../config/env';
import { CustomerEntity } from './entities/customer.entity';
import { ProductEntity } from './entities/product.entity';
import { OrderEntity } from './entities/order.entity';
import { OrderItemEntity } from './entities/order-item.entity';

/**
 * The single TypeORM DataSource, used both by the running app and by the
 * migration CLI (`npm run migration:*`). `synchronize` is intentionally OFF —
 * the schema is owned by explicit, code-first migrations, as the brief requires.
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: config.DB_HOST,
  port: config.DB_PORT,
  username: config.DB_USERNAME,
  password: config.DB_PASSWORD,
  database: config.DB_NAME,
  synchronize: false,
  logging: config.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  entities: [CustomerEntity, ProductEntity, OrderEntity, OrderItemEntity],
  migrations: [path.join(__dirname, 'migrations', '*.{ts,js}').replace(/\\/g, '/')],
});
// NOTE: keep exactly one DataSource export here — the TypeORM CLI rejects a file
// that exports more than one DataSource instance.
