import type { Severity } from 'config';
import type { Level } from 'pino';
import { externalLogger } from '#/middlewares/logger/external-logger';
import { pinoLogger } from '#/pino-config';

const consoleMethodMap: Record<Level, Severity> = {
  fatal: 'error',
  error: 'error',
  warn: 'warn',
  info: 'info',
  debug: 'debug',
  trace: 'debug',
};

/**
 * Logs significant events with optional additional data to console and an external logging service.
 *
 * @param msg - Main message or description of the event.
 * @param meta - Optional additional data to log along with the event message.
 * @param severity - `'fatal' | 'trace' | 'debug' | 'log' | 'info' | 'warn' | 'error'`, Severity of event, defaults to 'info'.
 */
export const logEvent = ({ msg, meta, severity = 'info' }: { msg: string; meta?: object; severity?: Level }): void => {
  // Log to Pino
  if (meta) pinoLogger[severity](meta, msg);
  else pinoLogger[severity](msg);

  // Log to external logger
  const consoleMethod = consoleMethodMap[severity];
  const externalLogFn = externalLogger?.[consoleMethod];

  if (typeof externalLogFn === 'function') {
    const args: [string, undefined?, object?] = meta ? [msg, undefined, meta] : [msg];
    externalLogFn(...args);
  }
};
