import type { z } from '@hono/zod-openapi';
import { i18n } from '#/lib/i18n';
import type { locales } from '#/lib/i18n-locales';
import type { apiErrorSchema } from '#/schemas';

type ErrorSchemaType = z.infer<typeof apiErrorSchema>;
type ErrorMeta = { readonly [key: string]: number | string[] | string | boolean | null } & {
  errorPagePath?: string;
  /** The token a refusal is about; a redirect passes it to the error page, which can offer a new link. Never a secret. */
  tokenId?: string;
};
type ErrorTexts = (typeof locales)['en'];
/** An error type: a key of `error.json`, or of `appError.json` for a type the app adds. */
export type ErrorKey = Exclude<keyof ErrorTexts['error'] | keyof ErrorTexts['appError'], `${string}.text`>;

export type AppErrorOpts = {
  entityType?: ErrorSchemaType['entityType'];
  meta?: ErrorMeta;
  originalError?: Error;
  /** Redirect to the error page in every mode, tests included; a route that answers 302 redirects on its own outside tests. */
  willRedirect?: boolean;
  name?: ErrorSchemaType['name'];
  /** What went wrong at this throw, in place of the type's general text. A 5xx's message reaches a client in development and test only. */
  message?: ErrorSchemaType['message'];
};

/** Custom error class for structured API errors with i18n support. */
export class AppError extends Error {
  override name: Error['name'];
  status: ErrorSchemaType['status'];
  type: ErrorSchemaType['type'];
  severity: ErrorSchemaType['severity'];
  willRedirect: boolean;
  entityType?: ErrorSchemaType['entityType'];
  meta?: ErrorMeta;

  constructor(status: ErrorSchemaType['status'], type: ErrorKey, severity: ErrorSchemaType['severity'], opts?: AppErrorOpts) {
    const i18nOpts = { ns: ['appError', 'error'], defaultValue: opts?.name ?? 'Unknown error' };
    super(opts?.message ?? i18n.t(`${type}.text`, { ...i18nOpts, defaultValue: i18n.t(type, i18nOpts) }));

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
