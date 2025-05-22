import type { Severity } from 'config';
import type { EventData } from '#/lib/errors';
import { externalLogger } from './external-logger';

/**
 * Logs significant events with optional additional data to console and an external logging service.
 *
 * @param message - Main message or description of the event.
 * @param eventData - Optional additional data to log along with the event message.
 * @param severity - `'debug' | 'log' | 'info' | 'warn' | 'error'`, Severity of event, defaults to 'info'.
 */
export const logEvent = (message: string, eventData?: EventData, severity: Severity = 'info') => {
  if (eventData) {
    console[severity](message, eventData);
    if (externalLogger) externalLogger[severity](message, undefined, eventData);
  } else {
    console[severity](message);
    if (externalLogger) externalLogger[severity](message);
  }
};
