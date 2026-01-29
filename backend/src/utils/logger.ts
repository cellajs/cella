import { appConfig, type Severity } from 'config';
import { eventLogger } from '#/pino';

const isProduction = appConfig.mode === 'production';

/**
 * Logs significant events with optional additional data to console and an external logging service.
 *
 * @param severity - `'fatal' | 'trace' | 'debug' | 'log' | 'info' | 'warn' | 'error'`.
 * @param msg - Main message or description of the event.
 * @param meta - Optional additional data to log along with the event message.
 */
export const logEvent = (severity: Severity, msg: string, meta?: object): void => {
  eventLogger[severity]({ ...(meta ?? {}), msg });
};

/**
 * Logs an unhandled error with its message and optional additional data.
 *
 * @param error - The error object to log.
 */
export const logError = (msg: string, error: Error | unknown, meta?: object): void => {
  // If not an instance of Error, log as unknown
  if (!(error instanceof Error)) {
    if (!isProduction) eventLogger.error(error);
    else eventLogger.error({ ...(meta ?? {}), msg, error });
    return;
  }

  const errorDetails = {
    errorName: error.name,
    errorMessage: error.message,
    errorStack: error.stack,
  };

  if (!isProduction) eventLogger.error(error);
  else eventLogger.error({ ...(meta ?? {}), errorDetails, msg });
};

export const getNodeLoggerLevel = (severity: Severity): 'error' | 'warn' | 'info' | 'debug' => {
  // Pino standard levels: fatal=60, error=50, warn=40, info=30, debug=20, trace=10
  const levelValues = { fatal: 60, error: 50, warn: 40, info: 30, debug: 20, trace: 10 };
  const severityValue = levelValues[severity];
  if (severityValue >= 50) return 'error';
  if (severityValue >= 40) return 'warn';
  if (severityValue >= 30) return 'info';
  return 'debug';
};
