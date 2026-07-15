import pino, { Logger } from 'pino';
import { config } from '../config/env';
import { ILogger } from '../../application/ports/logger.port';

/**
 * Structured JSON logger (replaces the .NET "Serilog" named in the brief).
 * Secrets are redacted so credentials/tokens never reach the logs.
 */
export const rootLogger: Logger = pino({
  level: config.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'password',
      'passwordHash',
      '*.password',
      '*.passwordHash',
    ],
    censor: '[REDACTED]',
  },
  transport:
    config.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
      : undefined,
});

/** Thin adapter exposing the application {@link ILogger} port. */
export class PinoLogger implements ILogger {
  constructor(private readonly logger: Logger = rootLogger) {}

  info(obj: unknown, msg?: string): void {
    this.logger.info(obj as object, msg);
  }
  warn(obj: unknown, msg?: string): void {
    this.logger.warn(obj as object, msg);
  }
  error(obj: unknown, msg?: string): void {
    this.logger.error(obj as object, msg);
  }
  debug(obj: unknown, msg?: string): void {
    this.logger.debug(obj as object, msg);
  }
}
