import { z } from '@hono/zod-openapi';
import { t } from 'i18next';
import { appConfig } from 'shared';
import { isCDNUrl } from 'shared/utils/is-cdn-url';
import { schemaTags } from '#/core/openapi-helpers';
import { maxLength } from '#/db/utils/constraints';

export { maxLength };

export const booleanTransformSchema = z
  .union([z.enum(['true', 'false']), z.boolean()])
  .default('false')
  .transform((value) => value === true || value === 'true')
  .openapi('BooleanQueryValue', {
    description: 'Boolean query value accepted as a boolean or its lowercase string representation.',
    'x-tags': schemaTags('base', 'cella'),
  });

export const entityTypeSchema = z.enum(appConfig.entityTypes);

export const channelEntityTypeSchema = z.enum(appConfig.channelEntityTypes);

export const productEntityTypeSchema = z.enum(appConfig.productEntityTypes);

// Common param schemas

export const validIdSchema = z.string().max(maxLength.id);

export const validTempIdSchema = z
  .string()
  .max(maxLength.id)
  .regex(/^temp-/, { message: 'ID must start with "temp-"' });

export const cookieSchema = z.string().max(maxLength.field);

export const sessionCookieSchema = z.object({
  sessionToken: z.string().max(maxLength.field),
  sessionId: z.string().max(maxLength.id),
  adminUserId: z.string().max(maxLength.id).optional(),
});

export const languageSchema = z.enum(appConfig.languages);

export const entityIdParamSchema = z.object({ id: validIdSchema });

/** True resolves the entity by slug, not by ID. */
export const slugQuerySchema = z.object({ slug: booleanTransformSchema.optional() });

export const tenantIdParamSchema = z.object({
  tenantId: validIdSchema,
  id: validIdSchema,
});

export const tenantOnlyParamSchema = z.object({
  tenantId: validIdSchema,
});

export const inOrgParamSchema = z.object({ organizationId: validIdSchema });

export const idInOrgParamSchema = z.object({ id: validIdSchema, organizationId: validIdSchema });

// Tenant-scoped param schemas (for RLS-enabled routes)

export const tenantOrgParamSchema = z.object({
  tenantId: validIdSchema,
  organizationId: validIdSchema,
});

export const idInTenantOrgParamSchema = z.object({
  tenantId: validIdSchema,
  organizationId: validIdSchema,
  id: validIdSchema,
});

export const userIdInTenantOrgParamSchema = z.object({
  tenantId: validIdSchema,
  organizationId: validIdSchema,
  userId: validIdSchema,
});

/** Cross-tenant routes with a relatability check. */
export const relatableUserIdParamSchema = z.object({
  relatableUserId: validIdSchema,
});

export const entityWithTypeQuerySchema = z.object({ entityId: validIdSchema, entityType: channelEntityTypeSchema });

const limitMax = 1000;
const integerQuerySchema = (fallback: number, message: string) =>
  z
    .string()
    .regex(/^\d+$/, message)
    .optional()
    .transform((value) => (value === undefined ? fallback : Number(value)))
    .refine(Number.isSafeInteger, message);

const seqCursorSchema = z
  .string()
  .regex(/^\d+,\d+$/)
  .superRefine((value, ctx) => {
    const [lower, upper] = value.split(',').map(Number);
    if (!Number.isSafeInteger(lower) || !Number.isSafeInteger(upper)) {
      ctx.addIssue({ code: 'custom', message: 'Sequence cursor bounds must be safe integers' });
    } else if (lower > upper) {
      ctx.addIssue({ code: 'custom', message: 'Sequence cursor lower bound must not exceed its upper bound' });
    }
  });

export const paginationQuerySchema = z.object({
  q: z.string().max(maxLength.field).optional(),
  sort: z.enum(['createdAt']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  offset: integerQuerySchema(0, t('error:invalid_offset')),
  limit: integerQuerySchema(appConfig.requestLimits.default, t('error:invalid_limit', { max: limitMax })).refine(
    (value) => value > 0 && value <= limitMax,
    t('error:invalid_limit', { max: limitMax }),
  ),
  /** Org-sequence delta filter: bounded inclusive range "51,150" (seq >= 51 AND <= 150). */
  seqCursor: seqCursorSchema.optional(),
});

export const excludeArchivedQuerySchema = z
  .enum(['true', 'false'])
  .optional()
  .transform((val) => val === 'true');

/** True returns fully hydrated relations. */
export const fullResponseQuerySchema = z.object({
  fullResponse: booleanTransformSchema.optional(),
});

export const includeOptions = ['counts', 'membership', 'members'] as const;
export type IncludeOption = (typeof includeOptions)[number];

/** Comma-separated, e.g. `?include=counts,membership`. */
export const includeQuerySchema = z
  .string()
  .optional()
  .transform((val) => (val ? val.split(',').map((s) => s.trim()) : []))
  .pipe(z.array(z.enum(includeOptions)));

export const slugIncludeQuerySchema = z.object({
  slug: booleanTransformSchema.optional(),
  include: includeQuerySchema,
});

export const emailOrTokenIdQuerySchema = z.union([
  z.object({ email: z.email({ message: t('error:invalid_email') }), tokenId: z.string().optional() }),
  z.object({ email: z.email().optional(), tokenId: z.string() }),
]);

export const idsBodySchema = (maxItems = 50) =>
  z.object({
    ids: z
      .array(z.string())
      .min(1, t('error:invalid_min_items', { min: 'one', name: 'ID' }))
      .max(maxItems, t('error:invalid_max_items', { max: maxItems, name: 'ID' })),
  });

/** The optional stx is what prevents echoing the change back to its source. */
export const idsWithStxBodySchema = (maxItems = 50) =>
  z.object({
    ids: z
      .array(z.string())
      .min(1, t('error:invalid_min_items', { min: 'one', name: 'ID' }))
      .max(maxItems, t('error:invalid_max_items', { max: maxItems, name: 'ID' })),
    stx: z
      .object({
        mutationId: z.string(),
        sourceId: z.string(),
      })
      .optional(),
  });

// Common headers schemas

export const locationSchema = z.object({ Location: z.string() });

// Validation schemas (for create and update)

/**
 * superRefine validator carrying a custom error type, which `defaultHook` reads from `params.type` for i18n.
 * @param errorType - Translation key, e.g. 'invalid_slug'.
 */
export const refineWithType = <T>(check: (val: T) => boolean, errorType: string) => {
  return (val: T, ctx: z.RefinementCtx) => {
    if (!check(val)) {
      ctx.addIssue({
        code: 'custom',
        message: t(`error:${errorType}`),
        input: val,
        params: { type: errorType },
      });
    }
  };
};

export const validUuidSchema = z.string().uuid({ message: t('error:invalid_id') });

export const noDuplicateSlugsRefine = (items: { slug: string }[]) =>
  new Set(items.map((i) => i.slug)).size === items.length;

export const validUrlSchema = z
  .string()
  .max(maxLength.url)
  .startsWith('https://', { message: t('error:invalid_url') })
  .superRefine(refineWithType((url: string) => url.startsWith('https://'), 'invalid_url'))
  .transform((str) => str.toLowerCase().trim());

export const validNameSchema = z
  .string()
  .min(2, t('error:invalid_between_num', { name: 'Name', min: 2, max: maxLength.field }))
  .max(maxLength.field, t('error:invalid_between_num', { name: 'Name', min: 2, max: maxLength.field }))
  .regex(/^[\p{L}\d\-., '&()]+$/u, { message: t('error:invalid_name') })
  .superRefine(refineWithType((s) => /^[\p{L}\d\-., '&()]+$/u.test(s), 'invalid_name'));

export const validEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(
    z
      .email({ message: t('error:invalid_email') })
      .min(4, t('error:invalid_between_num', { name: 'Email', min: 4, max: maxLength.field }))
      .max(maxLength.field, t('error:invalid_between_num', { name: 'Email', min: 4, max: maxLength.field })),
  )
  .openapi({ type: 'string', format: 'email', minLength: 4, maxLength: maxLength.field });

const canonicalDomainPattern =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
export const validDomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(
    z
      .string()
      .min(4, t('error:invalid_between_num', { name: 'Domain', min: 4, max: maxLength.field }))
      .max(maxLength.field, t('error:invalid_between_num', { name: 'Domain', min: 4, max: maxLength.field }))
      .regex(canonicalDomainPattern, { message: t('error:invalid_domain') }),
  )
  .openapi({
    type: 'string',
    format: 'hostname',
    minLength: 4,
    maxLength: maxLength.field,
    pattern: canonicalDomainPattern.source,
  });

export const validSlugSchema = z
  .string()
  .min(2, t('error:invalid_between_num', { name: 'Slug', min: 2, max: maxLength.field }))
  .max(maxLength.field, t('error:invalid_between_num', { name: 'Slug', min: 2, max: maxLength.field }))
  .regex(/^[a-z0-9]+(-{0,3}[a-z0-9]+)*$/i, { message: t('error:invalid_slug') })
  .superRefine(refineWithType((s) => /^[a-z0-9]+(-{0,3}[a-z0-9]+)*$/i.test(s), 'invalid_slug'))
  .transform((str) => str.toLowerCase().trim());

/** superRefine, because the allowed CDN hosts come from runtime config and cannot be a static JSON-schema pattern. */
export const validCDNUrlSchema = z
  .string()
  .max(maxLength.url)
  .superRefine(refineWithType((url: string) => isCDNUrl(url), 'invalid_cdn_url'))
  .transform((str) => str.trim());

export const validDomainsSchema = validDomainSchema.array().optional();
