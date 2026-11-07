import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { appConfig, MissingAncestorError, type Severity } from 'shared';
import { withoutFailedQuery } from 'shared/utils/failed-query';
import { scrubUrl } from 'shared/utils/scrub-url';
import type { Env } from '#/core/context';
import { AppError, type AppErrorStatus, type ErrorKey, errorTitle } from '#/core/error';
import { checksAuthoringRules, clientPath, undocumentedErrorStatus } from '#/core/openapi-validation';
import { keepOrganizationAdminConstraint } from '#/db/membership-rules';
import { env } from '#/env';
import { problemJsonType } from '#/schemas/error-response-schemas';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';

/** A 5xx's own message (SQL, parameters, internals) reaches a client only where that client is the developer. */
const exposesServerMessages = () => appConfig.mode === 'development' || appConfig.mode === 'test';
const severitiesRequiringDetails = new Set(['warn', 'error', 'fatal']);

const pgErrorMap: Record<string, { status: AppErrorStatus; type: ErrorKey; message: string }> = {
  // Foreign key violations
  '23503': { status: 400, type: 'invalid_request', message: 'Referenced resource does not exist' },
  // Unique constraint violations
  '23505': { status: 409, type: 'resource_already_exists', message: 'Resource already exists' },
  // Not null violations
  '23502': { status: 400, type: 'invalid_request', message: 'Required field is missing' },
  // Check constraint violations
  '23514': { status: 400, type: 'invalid_request', message: 'Value violates constraint' },
  // Invalid text representation: a value that cannot be read as its column type, such as a malformed id in a path
  '22P02': { status: 400, type: 'invalid_request', message: 'Malformed identifier or value' },
  // Character not in repertoire: a NUL character, which no text value holds, in an id or in a written value
  '22021': { status: 400, type: 'invalid_request', message: 'Malformed identifier or value' },
  // Untranslatable character: the same NUL inside a JSON value
  '22P05': { status: 400, type: 'invalid_request', message: 'Malformed identifier or value' },
  // RLS policy violations (insufficient_privilege)
  '42501': { status: 403, type: 'forbidden', message: 'Access denied by security policy' },
  // Serialization failure (concurrent update)
  '40001': { status: 409, type: 'write_conflict', message: 'Concurrent update conflict, please retry' },
  // Deadlock detected
  '40P01': { status: 409, type: 'write_conflict', message: 'Operation conflict, please retry' },
};

/** Named database constraints whose refusal is a rule the user can act on, mapped ahead of the generic code map. */
const pgConstraintMap: Record<string, { status: AppErrorStatus; type: ErrorKey; message: string }> = {
  [keepOrganizationAdminConstraint]: { status: 409, type: 'last_admin', message: 'An organization keeps at least one admin' },
};

type PgErrorInfo = { code: string; detail?: string; constraint?: string };

/** Reads PG error info off the error or its `.cause`, where Drizzle stores the original PG error. */
export function extractPgError(err: unknown): PgErrorInfo | null {
  if (err instanceof Error && 'code' in err && typeof err.code === 'string') return err as Error & PgErrorInfo;
  const cause = err instanceof Error ? err.cause : undefined;
  if (cause && typeof cause === 'object' && 'code' in cause && typeof cause.code === 'string') return cause as PgErrorInfo;
  return null;
}

/** Detects pool exhaustion: pg.Pool throws a plain Error with a fixed message when it cannot acquire a connection. */
function isPoolTimeoutError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  return msg.includes('timeout exceeded when trying to connect') || msg.includes('Cannot use a pool after calling end');
}

/** A Hono `HTTPException` carries a status and no error key: below 500 it refuses the request itself. */
const httpExceptionType = (status: number): ErrorKey => (status >= 500 ? 'server_error' : status === 403 ? 'forbidden' : 'invalid_request');

/** What a client may see of a thrown value: type, title, status and a detail that never carries server internals. */
interface ClientError {
  type: ErrorKey;
  title: string;
  status: ContentfulStatusCode;
  detail: string;
  severity: Severity;
  entityType?: AppError['entityType'];
  /** The extension members, top-level members of the body. */
  meta?: AppError['meta'];
  /** The error came from an `AppError` thrown with `willRedirect`: answer with a redirect to its error page in every mode. */
  willRedirect: boolean;
}

/** A client error that answers as JSON, titled with its type's own text. */
const jsonClientError = (type: ErrorKey, status: ContentfulStatusCode, detail: string, severity: Severity): ClientError => ({
  type,
  title: errorTitle(type, status),
  status,
  detail,
  severity,
  willRedirect: false,
});

/** Request facts for the error's log line (`path`, `method`, `userId`, `organizationId`, an MCP `tool`); unset ones are left out. */
type ErrorLogFields = Record<string, string | undefined>;

interface ToClientErrorOptions {
  /** Keep a 5xx error's own message as its detail. Default: development and test only; a caller answering a third party passes false. */
  exposeServerMessage?: boolean;
}

/** The shared engine's refusal of a subject built without a required ancestor id. */
const missingAncestorError = (err: MissingAncestorError) =>
  new AppError(400, 'missing_ancestor', 'error', {
    entityType: err.entityType,
    meta: { missingChannel: err.missingChannel, missingKey: err.missingKey },
  });

/**
 * Maps any thrown value to the error a client may see, and logs it once. An `AppError` passes through, and so does a
 * `MissingAncestorError`, as a 400; a Postgres error with a known code maps to its status and a fixed detail; pool
 * exhaustion answers 503; anything else is a 500 whose message (for a failed query: the SQL and its parameters)
 * reaches the client as its detail only with `exposeServerMessage`. The title is the type's own text.
 * The logger writes a failed query with the database's reason alone, never its SQL or values.
 */
export function toClientError(
  thrown: unknown,
  logFields: ErrorLogFields = {},
  { exposeServerMessage = exposesServerMessages() }: ToClientErrorOptions = {},
): ClientError {
  const err = thrown instanceof MissingAncestorError ? missingAncestorError(thrown) : thrown;
  const fields = Object.fromEntries(Object.entries(logFields).filter(([, value]) => value !== undefined));
  const hideIfServerError = (status: number, message: string) => (status >= 500 && !exposeServerMessage ? 'Internal server error' : message);

  if (isPoolTimeoutError(err)) {
    log.error('Database pool exhausted', { err, ...fields });
    return jsonClientError('service_unavailable', 503, 'Service temporarily unavailable, please retry', 'error');
  }

  if (err instanceof HTTPException) {
    log.warn(`HTTPException ${err.status}`, { err, ...fields });
    return jsonClientError(httpExceptionType(err.status), err.status, hideIfServerError(err.status, err.message || 'Request rejected'), 'warn');
  }

  const isAppError = err instanceof AppError;
  const pgError = !isAppError ? extractPgError(err) : null;
  const pgMappedError = pgError ? ((pgError.constraint ? pgConstraintMap[pgError.constraint] : undefined) ?? pgErrorMap[pgError.code]) : undefined;

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
          // The code and constraint only: a database error's detail quotes the row's values.
          ...(pgError && { pgCode: pgError.code, pgConstraint: pgError.constraint }),
          ...(meta && { meta }),
        }
      : undefined,
  );

  return {
    ...jsonClientError(type, status, hideIfServerError(status, message), severity),
    entityType,
    meta,
    willRedirect: isAppError && err.willRedirect,
  };
}

/** Global error handler for Hono API routes. */
export const appErrorHandler: ErrorHandler<Env> = (err, ctx) => {
  // Redact secret path segments before logging or returning them: Pino's key-based redaction cannot reach inside `path`.
  // A custom method shows as the client sent it (`:verb`), not at its routable path.
  const safePath = scrubUrl(clientPath(ctx.req.path));
  const answered = toClientError(err, {
    path: safePath,
    method: ctx.req.method,
    userId: ctx.get('user')?.id,
    organizationId: ctx.get('organization')?.id,
  });

  // An error status the route does not document is an authoring mistake: a test gets a 500 that names the fix, development a warning.
  const undocumented = checksAuthoringRules ? undocumentedErrorStatus(ctx.var.operationId, answered.status, answered.type) : undefined;
  if (undocumented && appConfig.mode === 'test') console.error(undocumented);
  else if (undocumented) log.warn(undocumented);
  const clientError =
    undocumented && appConfig.mode === 'test' ? { ...answered, ...jsonClientError('server_error', 500, undocumented, 'error') } : answered;

  // Rate limiters classify the outcome by this status: the redirect below answers 302 whatever went wrong.
  ctx.set('errorStatus', clientError.status);

  // The tracing middleware records `ctx.error` on the request span: a failed query goes there as the database's reason.
  const traced = withoutFailedQuery(err);
  if (traced instanceof Error) ctx.error = traced;

  // Every 429 that states its wait sends it as the header the 429 response documents, whatever threw it, a redirect too.
  const retryAfter = clientError.status === 429 ? clientError.meta?.retryAfter : undefined;
  if (typeof retryAfter === 'number') ctx.header('Retry-After', String(retryAfter));

  // A navigation's refusal answers with a redirect to its error page, whatever refused it; tests read the JSON body.
  if (clientError.willRedirect || (ctx.var.errorPagePath !== undefined && appConfig.mode !== 'test')) {
    const redirectUrl = new URL(ctx.var.errorPagePath || '/error', appConfig.frontendUrl);
    redirectUrl.searchParams.set('error', clientError.type);
    redirectUrl.searchParams.set('severity', clientError.severity);
    if (clientError.meta?.tokenId) redirectUrl.searchParams.set('tokenId', clientError.meta.tokenId);
    return ctx.redirect(redirectUrl, 302);
  }

  const { willRedirect: _willRedirect, meta, type, title, status, detail, ...refusal } = clientError;
  const problem = {
    type,
    title,
    status,
    detail,
    instance: ctx.get('requestId'),
    ...refusal,
    version: env.RELEASE_SHA,
    path: safePath,
    method: ctx.req.method,
    timestamp: getIsoDate(),
  };
  // Problem Details (RFC 9457): the fixed members lead, each `meta` entry is a member of its own and never replaces one.
  return ctx.json({ ...problem, ...meta, ...problem }, status, { 'Content-Type': problemJsonType });
};
