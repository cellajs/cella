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

/** PostgreSQL error codes to user-friendly error mappings */
const PG_ERROR_MAP: Record<string, { status: number; type: ErrorKey; message: string }> = {
  // Foreign key violations
  '23503': { status: 400, type: 'invalid_request', message: 'Referenced resource does not exist' },
  // Unique constraint violations
  '23505': { status: 409, type: 'duplicate_creation', message: 'Resource already exists' },
  // Not null violations
  '23502': { status: 400, type: 'invalid_request', message: 'Required field is missing' },
  // Check constraint violations
  '23514': { status: 400, type: 'invalid_request', message: 'Value violates constraint' },
  // RLS policy violations (insufficient_privilege)
  '42501': { status: 403, type: 'forbidden', message: 'Access denied by security policy' },
  // Serialization failure (concurrent update)
  '40001': { status: 409, type: 'server_error', message: 'Concurrent update conflict, please retry' },
  // Deadlock detected
  '40P01': { status: 409, type: 'server_error', message: 'Operation conflict, please retry' },
};

type PgErrorInfo = { code: string; detail?: string; constraint?: string };

/**
 * Extracts PostgreSQL error info from an error, checking both the error itself
 * and its cause (Drizzle ORM wraps PG errors in DrizzleQueryError with the original on .cause).
 */
function extractPgError(err: unknown): PgErrorInfo | null {
  // Direct PG error (e.g., raw pg client)
  if (err instanceof Error && 'code' in err && typeof (err as { code: unknown }).code === 'string') {
    return err as Error & PgErrorInfo;
  }
  // Drizzle-wrapped PG error (original PG error stored on .cause)
  const cause = err instanceof Error ? err.cause : undefined;
  if (cause && typeof cause === 'object' && 'code' in cause && typeof (cause as { code: unknown }).code === 'string') {
    return cause as PgErrorInfo;
  }
  return null;
}

/**
 * Global error handler for Hono API routes.
 */
export const appErrorHandler: ErrorHandler<Env> = (err, ctx) => {
  const isAppError = err instanceof AppError;

  // Check if this is a PostgreSQL error we can map to a friendlier message (also unwraps Drizzle-wrapped errors)
  const pgError = !isAppError ? extractPgError(err) : null;
  const pgMappedError = pgError ? PG_ERROR_MAP[pgError.code] : undefined;

  const severity = isAppError ? err.severity : pgMappedError ? 'warn' : 'error';
  const type = isAppError ? err.type : (pgMappedError?.type ?? 'server_error');
  const status = isAppError ? err.status : (pgMappedError?.status ?? 500);
  const name = err.name ?? 'ApiError';
  const entityType = isAppError ? err.entityType : undefined;
  const meta = isAppError ? err.meta : undefined;
  const willRedirect = isAppError ? err.willRedirect : false;

  // Use mapped message for PG errors, otherwise original
  const message = pgMappedError?.message ?? err.message;

  const user = ctx.get('user');
  const organization = ctx.get('organization');
  const detailsRequired = severitiesRequiringDetails.has(severity);

  const includeStack = severity === 'error' || severity === 'fatal';

  const detailedError = {
    message,
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
    ...(pgError && { pgCode: pgError.code, pgDetail: pgError.detail, pgConstraint: pgError.constraint }),
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
