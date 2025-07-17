import type { Severity } from 'config';
import type { ErrorMeta } from '#/lib/errors';
import { externalLogger } from '#/middlewares/logger/external-logger';

/**
 * Logs significant events with optional additional data to console and an external logging service.
 *
 * @param message - Main message or description of the event.
 * @param eventMeta - Optional additional data to log along with the event message.
 * @param severity - `'debug' | 'log' | 'info' | 'warn' | 'error'`, Severity of event, defaults to 'info'.
 */
export const logEvent = (message: string, eventMeta?: ErrorMeta, severity: Severity = 'info') => {
  if (eventMeta) {
    console[severity](message, eventMeta);
    if (externalLogger) externalLogger[severity](message, undefined, eventMeta);
  } else {
    console[severity](message);
    if (externalLogger) externalLogger[severity](message);
  }
};
