import 'reflect-metadata';
import bcrypt from 'bcryptjs';
import { AppDataSource } from '../data-source';
import { config } from '../../config/env';
import { rootLogger } from '../../logging/pino.logger';
import { Role } from '../../../domain/entities/enums';
import { CustomerEntity } from '../entities/customer.entity';
import { ProductEntity } from '../entities/product.entity';

/**
 * Idempotent seed: creates the admin account (from env) and a small product
 * catalogue if they do not already exist. Run with `npm run seed`.
 */
const SAMPLE_PRODUCTS = [
  { name: 'Wireless Mouse', price: 25.5 },
  { name: 'Mechanical Keyboard', price: 89.99 },
  { name: 'USB-C Hub', price: 45.0 },
  { name: '27" Monitor', price: 299.0 },
  { name: 'Laptop Stand', price: 39.95 },
];

async function seed(): Promise<void> {
  await AppDataSource.initialize();
  const customers = AppDataSource.getRepository(CustomerEntity);
  const products = AppDataSource.getRepository(ProductEntity);

  const existingAdmin = await customers.findOne({ where: { email: config.ADMIN_EMAIL } });
  if (existingAdmin) {
    rootLogger.info({ email: config.ADMIN_EMAIL }, 'Admin already exists — skipping');
  } else {
    const passwordHash = await bcrypt.hash(config.ADMIN_PASSWORD, 10);
    await customers.save(
      customers.create({
        name: config.ADMIN_NAME,
        email: config.ADMIN_EMAIL,
        passwordHash,
        role: Role.Admin,
        isActive: true,
      }),
    );
    rootLogger.info({ email: config.ADMIN_EMAIL }, 'Admin account created');
  }

  for (const p of SAMPLE_PRODUCTS) {
    const exists = await products.findOne({ where: { name: p.name } });
    if (!exists) {
      await products.save(products.create({ ...p, isActive: true }));
    }
  }
  rootLogger.info({ count: SAMPLE_PRODUCTS.length }, 'Product catalogue seeded');

  await AppDataSource.destroy();
}

seed()
  .then(() => {
    rootLogger.info('Seed complete');
    process.exit(0);
  })
  .catch((err) => {
    rootLogger.error({ err }, 'Seed failed');
    process.exit(1);
  });
