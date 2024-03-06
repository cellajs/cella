import { Severity, customLogger } from './custom-logger';
import { i18n } from './i18n';
import { Context } from 'hono';
import { errorSchema } from './common-schemas';
import { z } from 'zod';

export type HttpStatus = 400 | 401 | 403 | 404 | 409 | 429 | 500;

export type ErrorType = z.infer<typeof errorSchema>;

export type LogData = {
  readonly [key: string]: number | string | boolean;
};

// Create error object and log it if needed
export const createError = (ctx: Context, httpStatus: HttpStatus, type: string, severity: Severity = 'info', log = false,  data?: LogData ) => {
  const translationKey = `common:error.${type}`;
  const message = i18n.t(translationKey);

  const error: ErrorType = {
    message,
    type: type,
    httpStatus,
    severity,
    logId: ctx.get('logId'),
    path: ctx.req.path,
    method: ctx.req.method,
    timestamp: new Date().toISOString(),
  };

  // Sometimes we want to log additional event data
  if (log) customLogger(message, data, severity);
  return error
};
  
// Return error as http response
export const errorResponse = (ctx: Context, httpStatus: HttpStatus, type: string, severity: Severity = 'info', log = false,  data?: LogData ) => {
  const error: ErrorType = createError(ctx, httpStatus, type, severity, log,  data );

  return ctx.json({ success: false, error }, httpStatus);
  };
