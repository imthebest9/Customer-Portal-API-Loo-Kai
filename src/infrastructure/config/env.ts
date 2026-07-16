import 'dotenv/config';
import { z } from 'zod';

/**
 * Centralised, validated application configuration.
 * The process fails fast (throws) at startup if any required variable is missing
 * or malformed, so misconfiguration never reaches runtime request handling.
 */
const booleanFromString = z
  .string()
  .transform((v) => v.toLowerCase() === 'true')
  .pipe(z.boolean());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  // Human-readable log lines instead of raw JSON. Defaults to on outside
  // production; set explicitly to get readable output from the container too.
  LOG_PRETTY: booleanFromString.optional(),

  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_USERNAME: z.string().default('postgres'),
  DB_PASSWORD: z.string().default('postgres'),
  DB_NAME: z.string().default('customer_portal'),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('1h'),

  ADMIN_EMAIL: z.string().email().default('admin@portal.local'),
  ADMIN_PASSWORD: z.string().min(8).default('Admin123!'),
  ADMIN_NAME: z.string().default('Portal Admin'),

  CACHE_DRIVER: z.enum(['memory', 'redis']).default('memory'),
  CACHE_TTL_SECONDS: z.coerce.number().int().nonnegative().default(60),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  EMAIL_DRIVER: z.enum(['console', 'smtp']).default('console'),
  EMAIL_FROM: z.string().default('Customer Portal <no-reply@portal.local>'),
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: booleanFromString.default('false'),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASSWORD: z.string().optional().default(''),
});

export type AppConfig = z.infer<typeof envSchema>;

let cached: AppConfig | undefined;

export function loadConfig(): AppConfig {
  if (cached) return cached;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  cached = parsed.data;
  return cached;
}

export const config = loadConfig();
