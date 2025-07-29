import { config, type Severity } from 'config';
import { logToExternal } from '#/middlewares/logger/external-logger';
import { pinoLogger } from '#/pino-config';

/**
 * Logs significant events with optional additional data to console and an external logging service.
 *
 * @param msg - Main message or description of the event.
 * @param meta - Optional additional data to log along with the event message.
 * @param severity - `'fatal' | 'trace' | 'debug' | 'log' | 'info' | 'warn' | 'error'`, Severity of event, defaults to 'info'.
 */
export const logEvent = ({ msg, meta, severity = 'info' }: { msg: string; meta?: object; severity?: Severity }): void => {
  // Log to Pino
  if (meta) pinoLogger[severity](meta, msg);
  else pinoLogger[severity](msg);

  // Log to external logger
  logToExternal(severity, msg, meta);
};

export const getNodeLoggerLevel = (severity: Severity): 'error' | 'warn' | 'info' | 'debug' => {
  const severityValue = config.severityLevels[severity];
  if (severityValue >= config.severityLevels.error) return 'error';
  if (severityValue >= config.severityLevels.warn) return 'warn';
  if (severityValue >= config.severityLevels.info) return 'info';
  return 'debug';
};
