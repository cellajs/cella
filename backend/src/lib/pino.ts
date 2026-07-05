import { appConfig } from 'shared';
import { createLog, createLogger } from 'shared/pino';
import { env } from '#/env';

// Sensitive fields to redact from logs (auth tokens, credentials).
// fast-redact (used by pino) does NOT support a recursive `**` wildcard, so each
// sensitive key is listed at the root (event meta is spread at the log root) and
// one level deep via `*.` (e.g. session.token). `code` is deliberately NOT
// redacted: it is logged legitimately as a websocket close code (cdc-websocket.ts),
// not as an OAuth authorization code.
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

// Check both NODE_ENV and appConfig.mode — NODE_ENV=production in containers disables pino-pretty.
const isProduction = appConfig.mode === 'production' || env.NODE_ENV === 'production';
const isTest = appConfig.mode === 'test';

/**
 * Logger for all requests.
 * This logger is used in logger middleware to log incoming and outgoing requests.
 * In development, pino-pretty handles formatting with the messageFormat template; in production
 * it emits JSON to stdout. When a Maple ingest key is set, request logs are also shipped to Maple.
 */
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

/**
 * Underlying pino instance for application logs. Not exported: all app logging
 * goes through `baseLog` below or the request-aware `log` in #/utils/logger,
 * so the err convention and dedup apply everywhere.
 */
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
