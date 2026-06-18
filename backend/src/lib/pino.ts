import pino from 'pino';
import { appConfig } from 'shared';
import { createLogger, createLogHelpers } from 'shared/pino';
import { env } from '#/env';

// Sensitive fields to redact from logs (auth tokens, credentials)
const redactedFields = [
  '**.secret', // Session secrets, token secrets, TOTP secrets
  '**.credentialId', // Passkey credentials
];

// Check both NODE_ENV and appConfig.mode — NODE_ENV=production in containers disables pino-pretty.
const isProduction = appConfig.mode === 'production' || env.NODE_ENV === 'production';
const isTest = appConfig.mode === 'test';

/**
 * Logger for all requests.
 * This logger is used in logger middleware to log incoming and outgoing requests.
 * In development, pino-pretty handles formatting with messageFormat template.
 */
export const requestLogger = pino(
  {
    level: isTest ? 'silent' : env.PINO_LOG_LEVEL,
    redact: {
      paths: [...redactedFields, 'req.headers.authorization', 'req.headers.cookie'],
      censor: '[REDACTED]',
    },
  },
  isProduction
    ? undefined
    : pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: false,
          singleLine: false,
          ignore: 'pid,hostname,level',
          messageFormat: '{method} {status} {url} ({responseTime}ms) @{userId}',
          hideObject: true,
        },
      }),
);

/**
 * Logger for manually logging events in the application.
 */
export const eventLogger = createLogger({
  level: env.PINO_LOG_LEVEL,
  isProduction,
  isTest,
  enableOtelTransport: true,
  redact: {
    paths: redactedFields,
    censor: '[REDACTED]',
  },
});

export const { logEvent, logError } = createLogHelpers(eventLogger, isProduction);
