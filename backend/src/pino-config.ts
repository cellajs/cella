import pino from 'pino';
import { env } from './env';

const transport = pino.transport({
  target: 'pino-pretty',
  options: {
    colorize: false,
    singleLine: true,
    ignore: 'pid,hostname,level',
  },
});

export const middlewareLogger = pino(
  {
    level: 'trace',
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', 'user.hashedPassword', 'user.unsubscribeToken'],
      censor: '[REDACTED]',
    },
  },
  transport,
);

export const pinoLogger = pino(
  {
    level: env.PINO_LOG_LEVEL,
    formatters: {
      level: (label) => ({ severity: label.toUpperCase() }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: ['user.hashedPassword', 'user.unsubscribeToken'],
      censor: '[REDACTED]',
    },
  },
  transport,
);
