import { appConfig } from 'config';
import pino from 'pino';
import { env } from './env';

const redactedFields = [
  'passwords.hashedPassword',
  'unsubscribeTokensTable.token',
  'session.token',
  'token.token',
  'totps.encoderSecretKey',
  'passkeys.credentialId',
];

// In production, we use the default pino logger
const isProduction = appConfig.mode === 'production';

/**
 * Logger for all requests.
 * This logger is used in logger middleware to log incoming and outgoing requests.
 */
export const requestLogger = pino(
  {
    level: isProduction ? 'info' : 'debug',
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
          singleLine: true,
          ignore: 'pid,hostname,level',
        },
      }),
);

/**
 * Logger for manually logging events in the application.
 */
export const eventLogger = pino(
  {
    level: env.PINO_LOG_LEVEL,
    customLevels: appConfig.severityLevels,
    useOnlyCustomLevels: true,
    formatters: {
      level: (label) => ({ level: label.toUpperCase() }),
    },
    redact: {
      paths: redactedFields,
      censor: '[REDACTED]',
    },
  },
  isProduction
    ? undefined
    : pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          singleLine: true,
          levelFirst: true,
          ignore: 'pid,hostname,time',
        },
      }),
);
