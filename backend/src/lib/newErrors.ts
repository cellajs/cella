import type { z } from '@hono/zod-openapi';
import * as Sentry from '@sentry/node';
import { config, type EntityType, type Severity } from 'config';
import type { Context } from 'hono';
import type { ClientErrorStatusCode, ServerErrorStatusCode } from 'hono/utils/http-status';
import i18n from 'i18next';
import { getContextOrganization, getContextUser } from '#/lib/context';
import type locales from '#/lib/i18n-locales';
import { externalLogger } from '#/middlewares/logger/external-logger';
import { logEvent } from '#/middlewares/logger/log-event';
import type { errorSchema } from '#/utils/schema/responses';

type Error = z.infer<typeof errorSchema>;

type StripPrefix<T, Prefix extends string> = T extends `${Prefix}${infer Rest}` ? Rest : T;
type ErrorKey = keyof (typeof locales)['en']['error'];
type SimplifiedErrorKey = StripPrefix<`error:${ErrorKey & string}`, 'error:'>;

type HttpErrorStatus = ClientErrorStatusCode | ServerErrorStatusCode;

type ConstructedError = {
  name?: Error['name'];
  message?: Error['message'];
  type: SimplifiedErrorKey;
  status: HttpErrorStatus;
  severity?: Severity;
  eventData?: { readonly [key: string]: number | string | boolean | null };
} & Omit<Error, 'name' | 'message' | 'severity'>;

// Custom error class to handle API errors
export class ApiError extends Error {
  name: Error['name'];
  status: HttpErrorStatus;
  type: SimplifiedErrorKey;
  severity: Severity;
  entityType?: EntityType;
  eventData?: { readonly [key: string]: number | string | boolean | null };

  constructor(error: ConstructedError) {
    const apiErrorMessage = i18n.t(`error:${error.type}.text`, { defaultValue: error.message ?? 'Unknown error' });
    super(apiErrorMessage);
    this.name = i18n.t(`error:${error.type}`, { defaultValue: error.name ?? 'ApiError' });
    this.status = error.status;
    this.type = error.type;
    this.entityType = error.entityType;
    this.severity = error.severity || 'info';
    this.eventData = error.eventData;
  }
}

export const handleApiError = (ctx: Context, apiError: ApiError, redirect = false) => {
  const { severity, type, message, eventData } = apiError;
  // Redirect to the frontend error page with query parameters for error details
  if (redirect) return ctx.redirect(`${config.frontendUrl}/error?error=${type}&severity=${severity}`, 302);

  // Get the current user and organization from context
  const user = getContextUser();
  const organization = getContextOrganization();

  const finalError: Error = {
    ...apiError,
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
