import type { z } from '@hono/zod-openapi';
import * as Sentry from '@sentry/node';
import type { ErrorHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import i18n from 'i18next';
import { appConfig } from 'shared';
import type { Env } from '#/lib/context';
import type locales from '#/lib/i18n-locales';
import { eventLogger } from '#/pino';
import type { apiErrorSchema } from '#/schemas';
import { getIsoDate } from '#/utils/iso-date';

const isProduction = appConfig.mode === 'production';
const severitiesRequiringDetails = new Set(['warn', 'error', 'fatal']);

type ErrorSchemaType = z.infer<typeof apiErrorSchema>;
type ErrorMeta = { readonly [key: string]: number | string[] | string | boolean | null } & { errorPagePath?: string };
export type ErrorKey = Exclude<keyof (typeof locales)['en']['error'], `${string}.text`>;

/** Optional parameters for AppError constructor. */
export type AppErrorOpts = {
  entityType?: ErrorSchemaType['entityType'];
  meta?: ErrorMeta;
  originalError?: Error;
  willRedirect?: boolean;
  name?: ErrorSchemaType['name'];
  message?: ErrorSchemaType['message'];
};

/** Custom error class for structured API errors with i18n support. */
export class AppError extends Error {
  name: Error['name'];
  status: ErrorSchemaType['status'];
  type: ErrorSchemaType['type'];
  severity: ErrorSchemaType['severity'];
  willRedirect: boolean;
  entityType?: ErrorSchemaType['entityType'];
  meta?: ErrorMeta;

  constructor(
    status: ErrorSchemaType['status'],
    type: ErrorKey,
    severity: ErrorSchemaType['severity'],
    opts?: AppErrorOpts,
  ) {
    const i18nOpts = { ns: ['appError', 'error'], defaultValue: opts?.name ?? 'Unknown error' };
    const messageFallback = opts?.message ?? i18n.t(type, i18nOpts);
    super(i18n.t(`${type}.text`, { ...i18nOpts, defaultValue: messageFallback }));

    this.name = opts?.name ?? i18n.t(type, { ...i18nOpts, defaultValue: 'ApiError' });
    this.status = status;
    this.type = type;
    this.entityType = opts?.entityType;
    this.severity = severity;
    this.willRedirect = opts?.willRedirect ?? false;
    this.meta = opts?.meta;
    this.stack = opts?.originalError?.stack ?? this.stack;
    this.cause = opts?.originalError?.cause;
  }
}

/**
 * Global error handler for Hono API routes.
 */
export const appErrorHandler: ErrorHandler<Env> = (err, ctx) => {
  const isAppError = err instanceof AppError;

  const severity = isAppError ? err.severity : 'error';
  const type = isAppError ? err.type : 'server_error';
  const status = isAppError ? err.status : 500;
  const name = err.name ?? 'ApiError';
  const entityType = isAppError ? err.entityType : undefined;
  const meta = isAppError ? err.meta : undefined;
  const willRedirect = isAppError ? err.willRedirect : false;

  const user = ctx.get('user');
  const organization = ctx.get('organization');
  const detailsRequired = severitiesRequiringDetails.has(severity);

  const includeStack = severity === 'error' || severity === 'fatal';

  const detailedError = {
    message: err.message,
    name,
    status,
    type,
    severity,
    entityType,
    cause: err.cause,
    logId: ctx.get('requestId'),
    ...(includeStack && { stack: err.stack }),
    path: ctx.req.path,
    method: ctx.req.method,
    userId: user?.id,
    organizationId: organization?.id,
    timestamp: getIsoDate(),
    meta,
  };

  if (detailsRequired) {
    Sentry.captureException(detailedError, { level: severity === 'warn' ? 'warning' : 'error' });
  }

  // Log with full details for warn/error/fatal, minimal for info
  const logPayload = detailsRequired
    ? { msg: detailedError.name, error: detailedError, ...(isProduction && meta) }
    : { msg: detailedError.name };

  // Log through event logger
  eventLogger[severity](logPayload);

  // Handle redirect if needed
  if (willRedirect) {
    const redirectUrl = new URL(meta?.errorPagePath || '/error', appConfig.frontendUrl);
    redirectUrl.searchParams.set('error', type);
    redirectUrl.searchParams.set('severity', severity);
    return ctx.redirect(redirectUrl, 302);
  }

  return ctx.json(detailedError, detailedError.status as ContentfulStatusCode);
};
