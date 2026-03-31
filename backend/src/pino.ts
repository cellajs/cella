import pino from 'pino';
import { appConfig } from 'shared';
import { createLogger } from 'shared/pino';
import { env } from './env';

// Sensitive fields to redact from logs (auth tokens, credentials, hashes)
const redactedFields = [
  '**.secret', // Session secrets, token secrets, TOTP secrets
  '**.hashedPassword', // Password hashes
  '**.credentialId', // Passkey credentials
];

// In production, we use the default pino logger
const isProduction = appConfig.mode === 'production';
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
