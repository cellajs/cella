import type { z } from '@hono/zod-openapi';
import * as Sentry from '@sentry/node';
import { config, type EntityType, type Severity } from 'config';
import type { Context } from 'hono';
import type { HTTPResponseError } from 'hono/types';
import type { ClientErrorStatusCode, ServerErrorStatusCode } from 'hono/utils/http-status';
import i18n from 'i18next';
import { type Env, getContextOrganization, getContextUser } from '#/lib/context';
import type locales from '#/lib/i18n-locales';
import { externalLogger } from '#/middlewares/logger/external-logger';
import { logEvent } from '#/middlewares/logger/log-event';
import type { errorSchema } from '#/utils/schema/responses';

export type ErrorType = z.infer<typeof errorSchema>;
export type EventData = { readonly [key: string]: number | string | boolean | null };

type StripPrefix<T, Prefix extends string> = T extends `${Prefix}${infer Rest}` ? Rest : T;
type ErrorKey = keyof (typeof locales)['en']['error'];
type SimplifiedErrorKey = StripPrefix<`error:${ErrorKey & string}`, 'error:'>;

type HttpErrorStatus = ClientErrorStatusCode | ServerErrorStatusCode;

type ConstructedError = {
  name?: Error['name'];
  message?: Error['message'];
  type: SimplifiedErrorKey;
  status: HttpErrorStatus;
  severity?: ErrorType['severity'];
  entityType?: ErrorType['entityType'];
  eventData?: EventData;
};

// Custom error class to handle API errors
export class ApiError extends Error {
  name: Error['name'];
  status: HttpErrorStatus;
  type: SimplifiedErrorKey;
  severity: Severity;
  redirectToFrontend: boolean;
  entityType?: EntityType;
  eventData?: { readonly [key: string]: number | string | boolean | null };

  constructor(error: ConstructedError & { redirectToFrontend?: boolean }) {
    const apiErrorMessage = i18n.t(`error:${error.type}.text`, { defaultValue: error.message ?? 'Unknown error' });
    super(apiErrorMessage);
    this.name = error.name ?? i18n.t(`error:${error.type}`, { defaultValue: 'ApiError' });
    this.status = error.status;
    this.type = error.type;
    this.entityType = error.entityType;
    this.severity = error.severity || 'info';
    this.redirectToFrontend = error.redirectToFrontend || false;
    this.eventData = error.eventData;
  }
}

export const handleApiError = (ctx: Context, apiError: Error | HTTPResponseError) => {
  if (!(apiError instanceof ApiError)) {
    Sentry.captureException(apiError);
    return ctx.json({ name: apiError.name, message: apiError.message, type: 'server_error', severity: 'error' }, 500);
  }

  const { redirectToFrontend, ...error } = apiError;
  const { severity, type, message, eventData } = error;

  // Redirect to the frontend error page with query parameters for error details
  if (redirectToFrontend) return ctx.redirect(`${config.frontendUrl}/error?error=${type}&severity=${severity}`, 302);

  // Get the current user and organization from context
  const user = getContextUser();
  const organization = getContextOrganization();

  const finalError: ErrorType = {
    ...error,
    logId: ctx.get('logId'),
    path: ctx.req.path,
    method: ctx.req.method,
    userId: user?.id,
    organizationId: organization?.id,
  };

  if (['warn', 'error'].includes(severity)) {
    // Log error to external logger and monitoring service
    if (externalLogger) externalLogger[severity](message, undefined, finalError);
    Sentry.captureException(finalError);
  } else if (eventData) logEvent(message, eventData, severity); // Log significant (non-error) events with additional data

  return ctx.json(finalError, finalError.status as 400); // TODO(BLOCKED): Review type assertion (as 400) https://github.com/honojs/hono/issues/2719
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
  ctx: Context<Env>,
  status: HttpErrorStatus,
  type: SimplifiedErrorKey,
  severity: Severity = 'info',
  entityType?: EntityType,
  eventData?: EventData,
  err?: Error,
) => {
  const translationKey = `error:${type}`;
  const message = i18n.t(translationKey);

  // Get the current user and organization from context
  const user = getContextUser();
  const organization = getContextOrganization();

  const error: ErrorType = {
    name: err?.name || 'ApiError',
    message,
    type: type,
    status,
    severity,
    logId: ctx.get('logId'),
    path: ctx.req.path,
    method: ctx.req.method,
    entityType,
    userId: user?.id,
    organizationId: organization?.id,
  };

  if (err || ['warn', 'error'].includes(severity)) {
    const data = { ...error, eventData };

    // Log error to external logger and monitoring service
    if (externalLogger) externalLogger[severity](message, undefined, data);
    Sentry.captureException(err);

    if (err) console.error(err);
  } else if (eventData) logEvent(message, eventData, severity); // Log significant (non-error) events with additional data

  return error;
};
