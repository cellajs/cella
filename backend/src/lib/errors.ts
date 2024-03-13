import type { Context } from 'hono';
import type { z } from 'zod';
import { logtail, logEvent } from '../middlewares/logger/log-event';
import type { errorSchema } from './common-schemas';
import { i18n } from './i18n';

export type HttpStatus = 400 | 401 | 403 | 404 | 409 | 429 | 500;

export type Severity = 'debug' | 'info' | 'log' | 'warn' | 'error';

export type ErrorType = z.infer<typeof errorSchema> & {
  eventData?: EventData;
  name?: Error['name'];
};

export type EventData = {
  readonly [key: string]: number | string | boolean;
};

// Create error object and log it if needed
export const createError = (
  ctx: Context,
  status: HttpStatus,
  type: string,
  severity: Severity = 'info',
  isEvent = false,
  eventData?: EventData,
  err?: Error,
) => {
  const translationKey = `common:error.${type}`;
  const message = i18n.t(translationKey);

  const user = ctx.get('user');
  const organization = ctx.get('organization');

  const error: ErrorType = {
    message,
    type: type,
    status,
    severity,
    logId: ctx.get('logId'),
    path: ctx.req.path,
    method: ctx.req.method,
    usr: user?.id,
    org: organization?.id,
  };

  if (err || ['warn', 'error'].includes(severity)) {
    const data = { ...error, eventData };

    logtail[severity](message, undefined, data as unknown as EventData);
    console.error(err);
  }
  // Log significant events with additional data
  else if (isEvent) logEvent(message, eventData, severity);

  return error;
};

// Return error as http response
export const errorResponse = (
  ctx: Context,
  status: HttpStatus,
  type: string,
  severity: Severity = 'info',
  isEvent = false,
  eventData?: EventData,
  err?: Error,
) => {
  const error: ErrorType = createError(ctx, status, type, severity, isEvent, eventData, err);

  return ctx.json({ success: false, error }, status);
};
