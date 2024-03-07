import { sendError, setCustomData, setNamespace } from '@appsignal/nodejs';
import { Context } from 'hono';
import { z } from 'zod';
import { appSignalLogger, logEvent } from '../middlewares/logger/log-event';
import { errorSchema } from './common-schemas';
import { i18n } from './i18n';

export type HttpStatus = 400 | 401 | 403 | 404 | 409 | 429 | 500;

export type Severity = 'trace' | 'debug' | 'info' | 'log' | 'warn' | 'error';

export type ErrorType = z.infer<typeof errorSchema> & {
  eventData?: EventData;
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

    const data = { ...error, eventData, group: type };

    // Send error to AppSignal
    sendError(err || (error.message as unknown as Error), () => {
      setCustomData(data);
      setNamespace('backend');
    });

    // Log to AppSignal and in console
    appSignalLogger[severity](message, data as unknown as EventData);
    console.error(err);

    return error;
  }

  // Log significant events with additional data
  if (isEvent) logEvent(message, eventData, severity);

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
