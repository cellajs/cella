import { config } from 'config';
import type { Context } from 'hono';
import type { ClientErrorStatusCode, ServerErrorStatusCode } from 'hono/utils/http-status';
import type { z } from 'zod';

import { logEvent, logtail } from '#/middlewares/logger/log-event';
import type { Entity } from '#/types/common';
import type { errorSchema } from '#/utils/schema/common-schemas';
import { getContextOrganization, getContextUser } from './context';
import { i18n } from './i18n';
import type locales from './i18n-locales';

type StripPrefix<T, Prefix extends string> = T extends `${Prefix}${infer Rest}` ? Rest : T;
type ErrorKey = keyof (typeof locales)['en']['error'];
type SimplifiedErrorKey = StripPrefix<`error:${ErrorKey & string}`, 'error:'>;

export type HttpErrorStatus = ClientErrorStatusCode | ServerErrorStatusCode;

export type ErrorType = z.infer<typeof errorSchema> & {
  eventData?: EventData;
  name?: Error['name'];
};

export type Severity = ErrorType['severity'];

export type EventData = {
  readonly [key: string]: number | string | boolean | null;
};

// Create error object and log it if needed
export const createError = (
  ctx: Context,
  status: HttpErrorStatus,
  type: SimplifiedErrorKey,
  severity: Severity = 'info',
  entityType?: Entity,
  eventData?: EventData,
  err?: Error,
) => {
  const translationKey = `error:${type}`;
  const message = i18n.t(translationKey);

  const user = getContextUser();
  const organization = getContextOrganization();

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
    if (err) console.error(err);
  }
  // Log significant events with additional data
  else if (eventData) logEvent(message, eventData, severity);

  return error;
};

// Return error as http response
export const errorResponse = (
  ctx: Context,
  status: HttpErrorStatus,
  type: SimplifiedErrorKey,
  severity: Severity = 'info',
  entityType?: Entity,
  eventData?: EventData,
  err?: Error,
) => {
  const error: ErrorType = createError(ctx, status, type, severity, entityType, eventData, err);

  // TODO: Review this type assertion (as 400)
  return ctx.json({ success: false, error }, status as 400);
};

// Redirect to frontend error page
export const errorRedirect = (ctx: Context, type: SimplifiedErrorKey, severity: Severity = 'info') =>
  ctx.redirect(`${config.frontendUrl}/error?error=${type}&severity=${severity}`, 302);
