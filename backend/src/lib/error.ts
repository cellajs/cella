import { trace } from '@opentelemetry/api';
import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { appConfig, type Severity } from 'shared';
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

/** Named database constraints whose refusal is a rule the user can act on, mapped ahead of the generic code map. */
const PG_CONSTRAINT_MAP: Record<string, { status: number; type: ErrorKey; message: string }> = {
  // Refused when an organization would be left without an admin; the trigger is defined in scripts/migrations.
  memberships_keep_org_admin: {
    status: 409,
    type: 'last_admin',
    message: 'An organization keeps at least one admin',
  },
};

type PgErrorInfo = { code: string; detail?: string; constraint?: string };

/** Reads PG error info off the error or its `.cause`, where Drizzle stores the original PG error. */
export function extractPgError(err: unknown): PgErrorInfo | null {
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

/** Detects pool exhaustion: pg.Pool throws a plain Error with a fixed message when it cannot acquire a connection. */
function isPoolTimeoutError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  return msg.includes('timeout exceeded when trying to connect') || msg.includes('Cannot use a pool after calling end');
}

/** What a client may see of a thrown value: status, type and a message that never carries server internals. */
export interface ClientError {
  message: string;
  name: string;
  status: number;
  /** Error key from `locales/en/error.json` (or an app's `appError.json`). */
  type: string;
  severity: Severity;
  entityType?: AppError['entityType'];
  meta?: AppError['meta'];
  /** The error came from an `AppError` thrown with `willRedirect`: answer with a redirect to its error page. */
  willRedirect: boolean;
}

/** Request facts for the error's log line (`path`, `method`, `userId`, `organizationId`, an MCP `tool`); unset ones are left out. */
export type ErrorLogFields = Record<string, string | undefined>;

export interface ToClientErrorOptions {
  /** Keep a 5xx error's own message. Default: every mode but production; a caller answering a third party passes false. */
  exposeServerMessage?: boolean;
}

/**
 * Maps any thrown value to the error a client may see, and logs it once. An `AppError` passes through; a Postgres
 * error with a known code maps to its status and a fixed message; pool exhaustion answers 503; anything else is a 500
 * whose message (for a failed query: the SQL and its parameters) stays in the log unless `exposeServerMessage`.
 * @param err - The thrown value.
 * @param logFields - Request facts for the log line.
 * @param options - Message exposure; defaults to hiding 5xx messages in production.
 * @returns The client-facing error.
 */
export function toClientError(
  err: unknown,
  logFields: ErrorLogFields = {},
  { exposeServerMessage = !isProduction }: ToClientErrorOptions = {},
): ClientError {
  const fields = Object.fromEntries(Object.entries(logFields).filter(([, value]) => value !== undefined));
  const hideIfServerError = (status: number, message: string) =>
    status >= 500 && !exposeServerMessage ? 'Internal server error' : message;

  if (isPoolTimeoutError(err)) {
    log.error('Database pool exhausted', { err, ...fields });
    return {
      message: 'Service temporarily unavailable, please retry',
      name: 'ApiError',
      status: 503,
      type: 'server_error',
      severity: 'error',
      willRedirect: false,
    };
  }

  // Hono's built-in HTTPException (e.g. from CSRF middleware)
  if (err instanceof HTTPException) {
    log.warn(`HTTPException ${err.status}`, { err, ...fields });
    return {
      message: hideIfServerError(err.status, err.message || 'Request rejected'),
      name: 'ApiError',
      status: err.status,
      type: err.status === 403 ? 'forbidden' : 'server_error',
      severity: 'warn',
      willRedirect: false,
    };
  }

  const isAppError = err instanceof AppError;
  const pgError = !isAppError ? extractPgError(err) : null;
  const pgMappedError = pgError
    ? ((pgError.constraint ? PG_CONSTRAINT_MAP[pgError.constraint] : undefined) ?? PG_ERROR_MAP[pgError.code])
    : undefined;

  const severity = isAppError ? err.severity : pgMappedError ? 'warn' : 'error';
  const type = isAppError ? err.type : (pgMappedError?.type ?? 'server_error');
  const status = isAppError ? err.status : (pgMappedError?.status ?? 500);
  const name = (err instanceof Error && err.name) || 'ApiError';
  const entityType = isAppError ? err.entityType : undefined;
  const meta = isAppError ? err.meta : undefined;
  const message = pgMappedError?.message ?? (err instanceof Error ? err.message : String(err));

  // Error type joins the message so deduplication separates AppError kinds; warn and above retain stack and context
  log[severity](
    `${name}: ${type}`,
    severitiesRequiringDetails.has(severity)
      ? {
          err,
          status,
          type,
          entityType,
          ...fields,
          ...(pgError && { pgCode: pgError.code, pgDetail: pgError.detail, pgConstraint: pgError.constraint }),
          ...(meta && { meta }),
        }
      : undefined,
  );

  return {
    message: hideIfServerError(status, message),
    name,
    status,
    type,
    severity,
    entityType,
    meta,
    willRedirect: isAppError ? err.willRedirect : false,
  };
}

/** Global error handler for Hono API routes. */
export const appErrorHandler: ErrorHandler<Env> = (err, ctx) => {
  // Redact secret path segments before logging or returning them: Pino's key-based redaction cannot reach inside `path`
  const safePath = scrubPath(ctx.req.path);
  const clientError = toClientError(err, {
    path: safePath,
    method: ctx.req.method,
    userId: ctx.get('user')?.id,
    organizationId: ctx.get('organization')?.id,
  });

  if (clientError.willRedirect) {
    const redirectUrl = new URL(clientError.meta?.errorPagePath || '/error', appConfig.frontendUrl);
    redirectUrl.searchParams.set('error', clientError.type);
    redirectUrl.searchParams.set('severity', clientError.severity);
    return ctx.redirect(redirectUrl, 302);
  }

  const { willRedirect: _willRedirect, ...body } = clientError;
  return ctx.json(
    {
      ...body,
      // Correlates browser tracing, server spans, and logs; falls back to request ID when no span records
      logId: trace.getActiveSpan()?.spanContext().traceId ?? ctx.get('requestId'),
      requestId: ctx.get('requestId'),
      path: safePath,
      method: ctx.req.method,
      timestamp: getIsoDate(),
    },
    clientError.status as ContentfulStatusCode,
  );
};
