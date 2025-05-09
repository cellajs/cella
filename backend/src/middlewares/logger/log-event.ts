import { Logtail } from '@logtail/node';
import type { Severity } from 'config';
import type { EventData } from '#/lib/errors';
import { env } from '../../env';

export const logtail = env.LOGTAIL_TOKEN ? new Logtail(env.LOGTAIL_TOKEN, {}) : undefined;

/**
 * Logs significant events with optional additional data to console and an external logging service (Logtail).
 *
 * @param message - Main message or description of the event.
 * @param eventData - Optional additional data to log along with the event message.
 * @param severity - `'debug' | 'log' | 'info' | 'warn' | 'error'`, Severity of event, defaults to 'info'.
 */
export const logEvent = (message: string, eventData?: EventData, severity: Severity = 'info') => {
  if (eventData) {
    console[severity](message, eventData);
    if (logtail) logtail[severity](message, undefined, eventData);
  } else {
    console[severity](message);
    if (logtail) logtail[severity](message);
  }
};
