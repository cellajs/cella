import { appConfig } from 'shared';
import { createLog, createLogger } from 'shared/pino';
import { env } from '#/env';
import { redactedFields } from '#/lib/redact-keys';

// NODE_ENV=production in containers disables pino-pretty.
const isProduction = appConfig.mode === 'production' || env.NODE_ENV === 'production';
const isTest = appConfig.mode === 'test';

/** Censored in every backend log line: secret columns and transport keys, plus the auth headers of a logged request. */
export const backendRedactPaths = [...redactedFields, 'req.headers.authorization', 'req.headers.cookie'];

/** Request logger: pino-pretty via messageFormat in dev, JSON to stdout in production, Maple when a key is set. */
export const requestLogger = createLogger({
  level: env.PINO_LOG_LEVEL,
  isProduction,
  isTest,
  enableOtelTransport: true,
  mapleSecretIngestKey: env.MAPLE_SECRET_INGEST_KEY,
  serviceName: `${appConfig.slug}-api`,
  redactPaths: backendRedactPaths,
  transportOptions: {
    colorize: false,
    singleLine: false,
    ignore: 'pid,hostname,level',
    messageFormat: '{method} {status} {url} ({responseTime}ms) @{userId}',
    hideObject: true,
  },
});

/** Not exported: all logging passes through `baseLog` or the request-aware `log`, keeping the err convention. */
const eventLogger = createLogger({
  level: env.PINO_LOG_LEVEL,
  isProduction,
  isTest,
  enableOtelTransport: true,
  mapleSecretIngestKey: env.MAPLE_SECRET_INGEST_KEY,
  serviceName: `${appConfig.slug}-api`,
  redactPaths: backendRedactPaths,
});

// Context-free log facade; most backend code should use `log` from #/utils/logger, which adds request context.
export const baseLog = createLog(eventLogger);
