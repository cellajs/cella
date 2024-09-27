import type { Context } from 'hono';
import type { ClientErrorStatusCode, ServerErrorStatusCode } from 'hono/utils/http-status';
import type { z } from 'zod';
import { logEvent, logtail } from '#/middlewares/logger/log-event';
import type { Entity } from '#/types/common';
import type { errorSchema } from '../utils/schema/common-schemas';
import { getContextUser, getOrganization } from './context';
import { i18n } from './i18n';

export type HttpErrorStatus = ClientErrorStatusCode | ServerErrorStatusCode;

export type Severity = 'debug' | 'info' | 'log' | 'warn' | 'error';

export type ErrorType = z.infer<typeof errorSchema> & {
  eventData?: EventData;
  name?: Error['name'];
};

export type EventData = {
  readonly [key: string]: number | string | boolean | null;
};

// Create error object and log it if needed
export const createError = (
  ctx: Context,
  status: HttpErrorStatus,
  type: string,
  severity: Severity = 'info',
  entityType?: Entity,
  eventData?: EventData,
  err?: Error,
) => {
  const translationKey = `common:error.${type}`;
  const message = i18n.t(translationKey);

  const user = getContextUser();
  const organization = getOrganization();

  const error: ErrorType = {
    message,
    type: type,
    status,
    severity,
    logId: ctx.get('logId'),
    path: ctx.req.path,
    method: ctx.req.method,
    entityType,
    usr: user?.id,
    org: organization?.id,
  };

  if (err || ['warn', 'error'].includes(severity)) {
    const data = { ...error, eventData };

    if (logtail) logtail[severity](message, undefined, data);
    console.error(err);
  }
  // Log significant events with additional data
  else if (eventData) logEvent(message, eventData, severity);

  return error;
};

// Return error as http response
export const errorResponse = (
  ctx: Context,
  status: HttpErrorStatus,
  type: string,
  severity: Severity = 'info',
  entityType?: Entity,
  eventData?: EventData,
  err?: Error,
) => {
  const error: ErrorType = createError(ctx, status, type, severity, entityType, eventData, err);

  // TODO: Review this assignment (as 400)
  return ctx.json({ success: false, error }, status as 400);
};
