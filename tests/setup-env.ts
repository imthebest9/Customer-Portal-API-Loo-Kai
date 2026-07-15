// Runs before any application module is imported (see jest.config.js setupFiles),
// so the eagerly-loaded config module sees a valid test environment.
import 'reflect-metadata';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-key-please-ignore';
process.env.JWT_EXPIRES_IN = '1h';
process.env.LOG_LEVEL = 'silent';
process.env.CACHE_DRIVER = 'memory';
process.env.EMAIL_DRIVER = 'console';
process.env.ADMIN_EMAIL = 'admin@portal.local';
process.env.ADMIN_PASSWORD = 'Admin123!';
process.env.ADMIN_NAME = 'Portal Admin';
