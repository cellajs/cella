import { appConfig, type Severity } from 'config';
import { eventLogger } from '#/pino-config';

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
    eventLogger.error({ ...(meta ?? {}), msg, error });
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
  const severityValue = appConfig.severityLevels[severity];
  if (severityValue >= appConfig.severityLevels.error) return 'error';
  if (severityValue >= appConfig.severityLevels.warn) return 'warn';
  if (severityValue >= appConfig.severityLevels.info) return 'info';
  return 'debug';
};
