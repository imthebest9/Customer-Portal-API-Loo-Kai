import 'reflect-metadata';
import { registerDependencies } from './container';
import { AppDataSource } from './infrastructure/database/data-source';
import { buildApp } from './app';
import { config } from './infrastructure/config/env';
import { rootLogger } from './infrastructure/logging/pino.logger';

async function bootstrap(): Promise<void> {
  // 1. Connect the database (schema is managed by migrations, not synchronize).
  await AppDataSource.initialize();
  rootLogger.info('Database connection established');

  // 2. Wire the composition root, then build the HTTP app.
  registerDependencies();
  const app = buildApp();

  const server = app.listen(config.PORT, () => {
    rootLogger.info(
      `Customer Portal API listening on http://localhost:${config.PORT} — docs at /api-docs`,
    );
  });

  const shutdown = async (signal: string): Promise<void> => {
    rootLogger.info({ signal }, 'Shutting down');
    server.close();
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  rootLogger.error({ err }, 'Fatal error during startup');
  process.exit(1);
});
