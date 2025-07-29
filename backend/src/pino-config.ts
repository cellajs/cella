import { config } from 'config';
import pino from 'pino';
import { env } from './env';

export const middlewareLogger = pino(
  {
    level: 'trace',
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', 'user.hashedPassword', 'user.unsubscribeToken'],
      censor: '[REDACTED]',
    },
  },
  pino.transport({
    target: 'pino-pretty',
    options: {
      colorize: false,
      singleLine: true,
      ignore: 'pid,hostname,level',
    },
  }),
);

export const pinoLogger = pino(
  {
    level: env.PINO_LOG_LEVEL,
    customLevels: config.severityLevels,
    useOnlyCustomLevels: true,
    formatters: {
      level: (label) => ({ level: label.toUpperCase() }),
    },
    redact: {
      paths: ['user.hashedPassword', 'user.unsubscribeToken'],
      censor: '[REDACTED]',
    },
  },
  pino.transport({
    target: 'pino-pretty',
    options: {
      colorize: true,
      singleLine: true,
      levelFirst: true,
      ignore: 'pid,hostname,time',
    },
  }),
);
