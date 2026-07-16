import pino, { Logger } from 'pino';
import { config } from '../config/env';
import { ILogger } from '../../application/ports/logger.port';

/**
 * Whether to render logs for humans rather than machines. LOG_PRETTY decides it;
 * absent that, only local development gets pretty output. The shipped
 * .env.example sets it so a reviewer running the container gets readable logs,
 * while a real deployment leaves it unset and emits JSON for a log aggregator
 * (and skips pretty-printing's cost on the hot path).
 *
 * Deliberately not `NODE_ENV !== 'production'`: that would switch the transport
 * on under `test` too, spawning a pino-pretty worker per Jest suite.
 */
const prettyLogs = config.LOG_PRETTY ?? config.NODE_ENV === 'development';

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
  transport: prettyLogs
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          // The message already carries method/path/status; the serialised req/res
          // objects behind it would only repeat that, one key per line.
          ignore: 'pid,hostname,req,res,responseTime',
        },
      }
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
