import { trace } from '@opentelemetry/api';
import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { appConfig } from 'shared';
import type { Env } from '#/core/context';
import { AppError, type ErrorKey } from '#/core/error';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';
import { scrubPath } from '#/utils/scrub-url';

const isProduction = appConfig.mode === 'production';
const severitiesRequiringDetails = new Set(['warn', 'error', 'fatal']);

/** PostgreSQL error codes to user-friendly error mappings */
const PG_ERROR_MAP: Record<string, { status: number; type: ErrorKey; message: string }> = {
  // Foreign key violations
  '23503': { status: 400, type: 'invalid_request', message: 'Referenced resource does not exist' },
  // Unique constraint violations
  '23505': { status: 409, type: 'resource_already_exists', message: 'Resource already exists' },
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
 * Detects pool exhaustion / connection timeout from node-postgres.
 * pg.Pool throws a plain Error with specific messages when it can't acquire a connection.
 */
function isPoolTimeoutError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  return msg.includes('timeout exceeded when trying to connect') || msg.includes('Cannot use a pool after calling end');
}

/**
 * Global error handler for Hono API routes.
 */
export const appErrorHandler: ErrorHandler<Env> = (err, ctx) => {
  // Redact secret path segments (e.g. the invoke-token bearer) before this path
  // is logged or returned in the client error payload. Pino's key-based redaction
  // cannot reach a secret embedded inside the `path` string value.
  const safePath = scrubPath(ctx.req.path);

  // Handle pool exhaustion as 503 Service Unavailable
  if (isPoolTimeoutError(err)) {
    log.error('Database pool exhausted', { err, path: safePath, method: ctx.req.method });
    return ctx.json(
      {
        message: 'Service temporarily unavailable, please retry',
        status: 503,
        type: 'server_error' as const,
        severity: 'error' as const,
        path: safePath,
        method: ctx.req.method,
        timestamp: getIsoDate(),
      },
      503,
    );
  }

  // Handle Hono's built-in HTTPException (e.g. from CSRF middleware)
  if (err instanceof HTTPException) {
    const status = err.status as ContentfulStatusCode;
    log.warn(`HTTPException ${status}`, { err, path: safePath, method: ctx.req.method });
    return ctx.json(
      {
        message: err.message || 'Request rejected',
        status,
        type: status === 403 ? 'forbidden' : 'server_error',
        severity: 'warn',
        path: safePath,
        method: ctx.req.method,
        timestamp: getIsoDate(),
      },
      status,
    );
  }

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

  // Client-facing correlation id: the active OTel trace id. One id now joins the
  // browser trace (frontend injects traceparent), the server span, every log line
  // (pino mixin stamps trace_id), and the Maple session timeline. Falls back to
  // the request id when no span is recording (tracing disabled/misconfigured).
  const logId = trace.getActiveSpan()?.spanContext().traceId ?? ctx.get('requestId');
  const timestamp = getIsoDate();

  // Message carries name + type so dedup keys on the error kind, not just the class name
  // (`AppError: forbidden` and `AppError: invalid_request` suppress independently).
  // Full details (err with stack/cause, request context) for warn/error/fatal, minimal for info.
  // tenantId/userId/organizationId/requestId are bound from the ambient log context;
  // trace_id (stamped on every log line by the pino mixin) is the client-facing logId.
  log[severity](
    `${name}: ${type}`,
    detailsRequired
      ? {
          err,
          status,
          type,
          entityType,
          path: safePath,
          method: ctx.req.method,
          ...(user && { userId: user.id }),
          ...(organization && { organizationId: organization.id }),
          ...(pgError && { pgCode: pgError.code, pgDetail: pgError.detail, pgConstraint: pgError.constraint }),
          ...(meta && { meta }),
        }
      : undefined,
  );

  // Handle redirect if needed
  if (willRedirect) {
    const redirectUrl = new URL(meta?.errorPagePath || '/error', appConfig.frontendUrl);
    redirectUrl.searchParams.set('error', type);
    redirectUrl.searchParams.set('severity', severity);
    return ctx.redirect(redirectUrl, 302);
  }

  const clientError = {
    message: isProduction && status >= 500 ? 'Internal server error' : message,
    name,
    status,
    type,
    severity,
    entityType,
    logId,
    path: safePath,
    method: ctx.req.method,
    timestamp,
    meta,
  };

  return ctx.json(clientError, clientError.status as ContentfulStatusCode);
};
