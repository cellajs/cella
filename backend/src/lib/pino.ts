import { appConfig } from 'shared';
import { createLog, createLogger } from 'shared/pino';
import { env } from '#/env';

// fast-redact lacks recursive wildcards, so sensitive keys are listed at root and one level deep.
// Keep `code` visible because it represents WebSocket close codes in logs.
const sensitiveKeys = [
  'secret', // Session secrets, token secrets, TOTP secrets
  'credentialId', // Passkey credentials
  'token',
  'accessToken',
  'refreshToken',
  'idToken',
  'codeVerifier',
  'sessionToken',
  'nonce',
  'password',
];
export const redactedFields = sensitiveKeys.flatMap((key) => [key, `*.${key}`]);

// NODE_ENV=production in containers disables pino-pretty.
const isProduction = appConfig.mode === 'production' || env.NODE_ENV === 'production';
const isTest = appConfig.mode === 'test';

/** Request logger: pino-pretty via messageFormat in dev, JSON to stdout in production, Maple when a key is set. */
export const requestLogger = createLogger({
  level: env.PINO_LOG_LEVEL,
  isProduction,
  isTest,
  enableOtelTransport: true,
  mapleSecretIngestKey: env.MAPLE_SECRET_INGEST_KEY,
  serviceName: `${appConfig.slug}-api`,
  redact: {
    paths: [...redactedFields, 'req.headers.authorization', 'req.headers.cookie'],
    censor: '[REDACTED]',
  },
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
  redact: {
    paths: redactedFields,
    censor: '[REDACTED]',
  },
});

// Context-free log facade; most backend code should use `log` from #/utils/logger, which adds request context.
export const baseLog = createLog(eventLogger);
