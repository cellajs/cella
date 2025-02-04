import { config } from 'config';
import type { Context } from 'hono';
import type { ClientErrorStatusCode, ServerErrorStatusCode } from 'hono/utils/http-status';
import type { z } from 'zod';

import type { Entity } from 'config';
import { logEvent, logtail } from '#/middlewares/logger/log-event';
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

/**
 * Create an error object, log it if needed, and return the error details.
 *
 * @param ctx - Request/response context.
 * @param status - The HTTP error status (e.g., 400, 500).
 * @param type - The error key, which is a `keyof locales.error`. It refers to an error type in your localization system.
 * @param severity - `'debug' | 'log' | 'info' | 'warn' | 'error'`, The severity of the error, defaults to 'info'.
 * @param entityType - Optional entity type (e.g., user, organization) related to the error.
 * @param eventData - Optional additional data for event logging.
 * @param err - Optional Error object to be logged.
 * @returns An error object containing details of the error.
 */
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

  // Get the current user and organization from context
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
  } else if (eventData) logEvent(message, eventData, severity); // Log significant events with additional data

  return error;
};

/**
 * Return an Error response as an HTTP JSON response.
 *
 * @param ctx - Request/response context.
 * @param status - The HTTP error status (e.g., 400, 500).
 * @param type - The error key, which is a `keyof locales.error`. It refers to an error type in your localization system.
 * @param severity - `'debug' | 'log' | 'info' | 'warn' | 'error'`, The severity of the error, defaults to 'info'.
 * @param entityType - Optional entity type (e.g., user, organization) related to the error.
 * @param eventData - Optional additional data for event logging.
 * @param err - Optional Error object to be logged.
 * @returns The HTTP Error response in JSON format.
 */
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

  return ctx.json({ success: false, error }, status as 400); // TODO: Review type assertion (as 400)
};

/**
 * Redirect the user to the frontend error page.
 *
 * @param ctx - Request/response context.
 * @param type - The error key, which is a `keyof locales.error`. It refers to an error type in your localization system.
 * @param severity - `'debug' | 'log' | 'info' | 'warn' | 'error'`, The severity of the error, defaults to 'info'.
 * @returns A 302 redirect response to the frontend error page.
 */
export const errorRedirect = (ctx: Context, type: SimplifiedErrorKey, severity: Severity = 'info') =>
  // Redirect to the frontend error page with query parameters for error details
  ctx.redirect(`${config.frontendUrl}/error?error=${type}&severity=${severity}`, 302);
