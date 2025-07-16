import type { z } from '@hono/zod-openapi';
import * as Sentry from '@sentry/node';
import { config } from 'config';
import type { ErrorHandler } from 'hono';
import i18n from 'i18next';
import { type Env, getContextOrganization, getContextUser } from '#/lib/context';
import type locales from '#/lib/i18n-locales';
import { externalLogger } from '#/middlewares/logger/external-logger';
import { logEvent } from '#/middlewares/logger/log-event';
import { getIsoDate } from '#/utils/iso-date';
import type { errorSchema } from '#/utils/schema/error';

type ErrorSchemaType = z.infer<typeof errorSchema>;
export type ErrorMeta = { readonly [key: string]: number | string | boolean | null };
export type ErrorKey = keyof (typeof locales)['en']['error'];

type ConstructedError = {
  type: ErrorKey;
  status: ErrorSchemaType['status'];
  name?: ErrorSchemaType['name'];
  message?: ErrorSchemaType['message'];
  severity?: ErrorSchemaType['severity'];
  entityType?: ErrorSchemaType['entityType'];
  meta?: ErrorMeta;
  originalError?: Error;
  redirectToFrontend?: boolean;
};

// Custom error class to handle API errors
export class ApiError extends Error {
  name: Error['name'];
  status: ErrorSchemaType['status'];
  type: ErrorSchemaType['type'];
  severity: ErrorSchemaType['severity'];
  redirectToFrontend: boolean;
  entityType?: ErrorSchemaType['entityType'];
  meta?: ErrorMeta;
  originalError?: Error;

  constructor(error: ConstructedError) {
    const apiErrorMessage = i18n.t(`error:${error.type}.text`, { defaultValue: error.message ?? 'Unknown error' });
    super(apiErrorMessage);
    this.name = error.name ?? i18n.t(`error:${error.type}`, { defaultValue: 'ApiError' });
    this.status = error.status;
    this.type = error.type;
    this.entityType = error.entityType;
    this.severity = error.severity || 'info';
    this.redirectToFrontend = error.redirectToFrontend || false;
    this.meta = error.meta;
    this.originalError = error.originalError;

    if (error.originalError) {
      this.stack = error.originalError.stack;
      this.cause = error.originalError;
    }
  }
}

export const handleApiError: ErrorHandler<Env> = (err, ctx) => {
  // Normalize error to ApiError if possible
  const apiError =
    err instanceof ApiError
      ? err
      : new ApiError({
          name: err.name ?? 'ApiError',
          status: 500,
          type: 'server_error',
          severity: 'error',
          originalError: err,
        });

  const { redirectToFrontend, originalError, ...error } = apiError;
  const { severity, type, message, meta } = error;

  // Redirect to the frontend error page with query parameters for error details
  if (redirectToFrontend) {
    const redirectUrl = `${config.frontendUrl}/error?error=${type}&severity=${severity}`;
    return ctx.redirect(redirectUrl, 302);
  }

  // Get the current user and organization from context
  const user = getContextUser();
  const organization = getContextOrganization();

  const enrichedError: ErrorSchemaType = {
    ...error,
    logId: ctx.get('logId'),
    path: ctx.req.path,
    method: ctx.req.method,
    userId: user?.id,
    organizationId: organization?.id,
    timestamp: getIsoDate(),
  };
  // Logging
  if (['warn', 'error'].includes(severity)) {
    // To external logger and monitoring service
    Sentry.captureException(enrichedError);
    if (externalLogger) externalLogger[severity](message, undefined, enrichedError);
    if (originalError) console.error(originalError);
  } else if (meta) {
    // Significant (non-error) events with additional data
    logEvent(message, meta, severity);
  }

  return ctx.json(enrichedError, enrichedError.status);
};
