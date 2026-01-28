import pino from 'pino';
import { env } from './env';

const isProduction = env.NODE_ENV === 'production';
const isTest = env.NODE_ENV === 'test';

/**
 * Proxy server pino logger instance.
 * Matches CDC/backend pattern for consistent structured logging.
 * Uses pino-pretty in development for readable output.
 */
export const proxyLogger = pino(
  {
    level: isTest ? 'silent' : isProduction ? 'info' : env.LOG_LEVEL,
    name: 'proxy',
  },
  isProduction
    ? undefined
    : pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          singleLine: true,
          ignore: 'pid,hostname',
        },
      }),
);

/** Severity levels supported by logEvent. */
export type ProxySeverity = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

/**
 * Logs significant proxy events with optional metadata.
 * Drop-in replacement for the backend/CDC logEvent function.
 *
 * @param severity - Log level to use
 * @param msg - Main message or description of the event
 * @param meta - Optional additional data to log
 */
export const logEvent = (severity: ProxySeverity, msg: string, meta?: object): void => {
  proxyLogger[severity]({ ...(meta ?? {}), msg });
};

/**
 * Logs an error with its stack trace and optional metadata.
 *
 * @param msg - Context message for the error
 * @param error - The error object to log
 * @param meta - Optional additional data to log
 */
export const logError = (msg: string, error: Error | unknown, meta?: object): void => {
  if (!(error instanceof Error)) {
    proxyLogger.error({ ...(meta ?? {}), msg, error });
    return;
  }

  const errorDetails = {
    errorName: error.name,
    errorMessage: error.message,
    errorStack: error.stack,
  };

  proxyLogger.error({ ...(meta ?? {}), errorDetails, msg });
};
