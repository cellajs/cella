import type { z } from '@hono/zod-openapi';
import i18n from 'i18next';
import type { locales } from '#/lib/i18n-locales';
import type { apiErrorSchema } from '#/schemas';

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
