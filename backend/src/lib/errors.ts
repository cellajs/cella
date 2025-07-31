import { type Env, getContextOrganization, getContextUser } from '#/lib/context';
import type locales from '#/lib/i18n-locales';
import { logToExternal } from '#/middlewares/logger/external-logger';
import { getIsoDate } from '#/utils/iso-date';
import { getNodeLoggerLevel } from '#/utils/logger';
import type { errorSchema } from '#/utils/schema/error';
import type { z } from '@hono/zod-openapi';
import * as Sentry from '@sentry/node';
import { appConfig } from 'config';
import type { ErrorHandler } from 'hono';
import i18n from 'i18next';

type ErrorSchemaType = z.infer<typeof errorSchema>;
type ErrorMeta = { readonly [key: string]: number | string | boolean | null };

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
  redirectToFrontend?: boolean;
};

// Custom error class to handle App errors
export class AppError extends Error {
  name: Error['name'];
  status: ErrorSchemaType['status'];
  type: ErrorSchemaType['type'];
  severity: ErrorSchemaType['severity'];
  redirectToFrontend: boolean;
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
    this.redirectToFrontend = error.redirectToFrontend || false;
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

export const handleAppError: ErrorHandler<Env> = (err, ctx) => {
  // Normalize error to AppError if possible
  const apiError =
    err instanceof AppError
      ? err
      : new AppError({
          name: err.name ?? 'ApiError',
          status: 500,
          type: 'server_error',
          severity: 'error',
          originalError: err,
        });

  // Get  non-enumerable 'stack', 'message', and 'cause'. These do NOT get included when using the spread operator (...)
  const { redirectToFrontend, originalError, message, cause, stack, ...error } = apiError;
  const { severity, type, meta } = error;

  // Get the current user and organization from context
  const user = getContextUser();
  const organization = getContextOrganization();

  const enrichedError = {
    ...error,
    stack,
    cause,
    message,
    logId: ctx.get('logId'),
    path: ctx.req.path,
    method: ctx.req.method,
    userId: user?.id,
    organizationId: organization?.id,
    timestamp: getIsoDate(),
  };

  // Send to Sentry
  if (['warn', 'error', 'fatal'].includes(severity)) {
    const level = severity === 'warn' ? 'warning' : 'error';
    Sentry.captureException(enrichedError, { level });
  }

  // External logger
  logToExternal(severity, message, enrichedError);

  // Console logging
  const nodeSevernity = getNodeLoggerLevel(severity);
  console[nodeSevernity](`[${severity.toUpperCase()}] ${message}`);
  if (meta) console[nodeSevernity]('Meta:', meta);
  if (stack) console.error(stack);

  // Redirect to the frontend error page with query parameters for error details
  if (redirectToFrontend) {
    const redirectUrl = `${appConfig.frontendUrl}/error?error=${type}&severity=${severity}`;
    return ctx.redirect(redirectUrl, 302);
  }

  return ctx.json(enrichedError, enrichedError.status);
};
