import { STATUS_CODES } from 'node:http';
import type { z } from '@hono/zod-openapi';
import { i18n } from '#/lib/i18n';
import type { apiErrorSchema, errorMemberValueSchema, ProblemMember } from '#/schemas/api-error-schemas';
import type { ErrorCode } from '#/schemas/error-response-schemas';
import type enAppError from '../../../locales/en/appError.json';
import type enError from '../../../locales/en/error.json';

type ErrorSchemaType = z.infer<typeof apiErrorSchema>;
/**
 * The statuses an `AppError` carries: a documented error code, 410 (the Yjs relay's internal route: the entity is gone)
 * or a server error.
 */
export type AppErrorStatus = ErrorCode | 410 | 500 | 503;
/** The extension members of the error body, each a top-level member beside the ones the body sets itself. */
type ErrorMeta = Record<string, z.infer<typeof errorMemberValueSchema>> &
  Partial<Record<ProblemMember, never>> & {
    /** The token a refusal is about; a redirect passes it to the error page, which can offer a new link. Never a secret. */
    tokenId?: string;
  };
/** An error type: a key of `error.json`, or of `appError.json` for a type the app adds. */
export type ErrorKey = Exclude<keyof typeof enError | keyof typeof enAppError, `${string}.text`>;

/** An app's own error texts are read before the template's. */
const errorNamespaces = ['appError', 'error'] as const;

/**
 * The `title` of an error body: the type's own text, the same for every occurrence, so it is safe to log.
 * @returns The HTTP reason phrase of `status` for a type without a text.
 */
export const errorTitle = (type: ErrorKey, status: number) => i18n.t(type, { ns: errorNamespaces, defaultValue: STATUS_CODES[status] ?? 'Error' });

type AppErrorOpts = {
  entityType?: ErrorSchemaType['entityType'];
  meta?: ErrorMeta;
  originalError?: Error;
  /** Redirect to the error page in every mode, tests included; a route that answers 302 redirects on its own outside tests. */
  willRedirect?: boolean;
  /** The body's `detail`: what went wrong at this throw, in place of the type's text. A 5xx's reaches a client in development and test only. */
  message?: ErrorSchemaType['detail'];
};

/** Custom error class for structured API errors with i18n support; `name` is the type's title, `message` the detail. */
export class AppError extends Error {
  override name: Error['name'];
  status: AppErrorStatus;
  type: ErrorKey;
  severity: ErrorSchemaType['severity'];
  willRedirect: boolean;
  entityType?: ErrorSchemaType['entityType'];
  meta?: ErrorMeta;

  constructor(status: AppErrorStatus, type: ErrorKey, severity: ErrorSchemaType['severity'], opts?: AppErrorOpts) {
    const title = errorTitle(type, status);
    // Passed to `super`, the cause stays non-enumerable as on a native error, so a log line never copies a library's plain-object cause.
    super(opts?.message ?? i18n.t(`${type}.text`, { ns: errorNamespaces, defaultValue: title }), { cause: opts?.originalError?.cause });

    this.name = title;
    this.status = status;
    this.type = type;
    this.entityType = opts?.entityType;
    this.severity = severity;
    this.willRedirect = opts?.willRedirect ?? false;
    this.meta = opts?.meta;
    this.stack = opts?.originalError?.stack ?? this.stack;
  }
}
