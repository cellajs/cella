import type { z } from '@hono/zod-openapi';
import * as Sentry from '@sentry/node';
import { appConfig } from 'config';
import type { ErrorHandler } from 'hono';
import i18n from 'i18next';
import { type Env, getContextOrganization, getContextUser } from '#/lib/context';
import type locales from '#/lib/i18n-locales';
import { eventLogger } from '#/pino-config';
import { getIsoDate } from '#/utils/iso-date';
import type { errorSchema } from '#/utils/schema/error';

const isProduction = appConfig.mode === 'production';

type ErrorSchemaType = z.infer<typeof errorSchema>;
type ErrorMeta = { readonly [key: string]: number | string[] | string | boolean | null };

type AllErrorKeys = keyof (typeof locales)['en']['error'];
type ErrorKey = Exclude<AllErrorKeys, `${string}.text`>;

type ConstructedError = {
  type: ErrorKey;
  status: ErrorSchemaType['status'];
  name?: ErrorSchemaType['name'];
  message?: ErrorSchemaType['message'];
  severity?: ErrorSchemaType['severity'];
  entityType?: ErrorSchemaType['entityType'];
  meta?: ErrorMeta;
  originalError?: Error;
  isRedirect?: boolean;
};

// Custom error class to handle App errors
export class AppError extends Error {
  name: Error['name'];
  status: ErrorSchemaType['status'];
  type: ErrorSchemaType['type'];
  severity: ErrorSchemaType['severity'];
  isRedirect: boolean;
  entityType?: ErrorSchemaType['entityType'];
  meta?: ErrorMeta;
  originalError?: Error;

  constructor(error: ConstructedError) {
    const messageFallback = error.message ?? i18n.t(`error:${error.type}`, { defaultValue: error.name ?? 'Unknown error' });
    const message = i18n.t(`error:${error.type}.text`, { defaultValue: messageFallback });
    super(message);
    this.name = error.name ?? i18n.t(`error:${error.type}`, { defaultValue: 'ApiError' });
    this.status = error.status;
    this.type = error.type;
    this.entityType = error.entityType;
    this.severity = error.severity || 'info';
    this.isRedirect = error.isRedirect || false;
    this.meta = error.meta;
    this.originalError = error.originalError;

    if (error.originalError?.stack) {
      this.stack = error.originalError.stack;
    }
    if (error.originalError?.cause) {
      this.cause = error.originalError.cause;
    }
  }
}

/**
 * Handles errors thrown in the api.
 */
export const handleAppError: ErrorHandler<Env> = (err, ctx) => {
  // Normalize error to AppError if possible
  const normalizedError =
    err instanceof AppError
      ? err
      : new AppError({
          name: err.name ?? 'ApiError',
          status: 500,
          type: 'server_error',
          severity: 'error',
          originalError: err,
        });

  // Get non-enumerable 'stack', 'message', and 'cause'. These do NOT get included when using the spread operator (...)
  const { isRedirect, originalError, message, cause, stack, ...error } = normalizedError;
  const { severity, type, meta } = error;

  // Get the current user and organization from context
  const user = getContextUser();
  const organization = getContextOrganization();

  const detailedError = {
    message,
    ...error,
    cause,
    logId: ctx.get('logId'),
    ...(['error', 'fatal'].includes(severity) ? { stack } : {}),
    path: ctx.req.path,
    method: ctx.req.method,
    userId: user?.id,
    organizationId: organization?.id,
    timestamp: getIsoDate(),
  };

  const detailsRequired = ['warn', 'error', 'fatal'].includes(severity);

  // Send to Sentry
  if (detailsRequired) {
    const level = severity === 'warn' ? 'warning' : 'error';
    Sentry.captureException(detailedError, { level });
  }

  // Log the error
  if (!isProduction) eventLogger[severity]({ msg: detailedError.name, ...(detailsRequired ? { error: detailedError } : {}) });
  else eventLogger[severity]({ ...(meta ?? {}), ...(detailsRequired ? { ...detailedError } : {}) });

  // Redirect to the frontend error page with query parameters for error details
  if (isRedirect) {
    const redirectUrl = `${appConfig.frontendUrl}/error?error=${type}&severity=${severity}`;
    return ctx.redirect(redirectUrl, 302);
  }

  return ctx.json(detailedError, detailedError.status);
};
