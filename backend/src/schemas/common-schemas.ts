import { z } from '@hono/zod-openapi';
import { t } from 'i18next';
import { appConfig } from 'shared';
import { isCDNUrl } from 'shared/utils/is-cdn-url';
import { schemaTags } from '#/core/openapi-helpers';
import { maxLength } from '#/db/utils/constraints';

export { maxLength };

/** Schema for boolean query parameters, accepting booleans and their exact string representations. */
export const booleanTransformSchema = z
  .union([z.enum(['true', 'false']), z.boolean()])
  .default('false')
  .transform((value) => value === true || value === 'true')
  .openapi('BooleanQueryValue', {
    description: 'Boolean query value accepted as a boolean or its lowercase string representation.',
    'x-tags': schemaTags('base', 'cella'),
  });

// Entity schemas

/** Enum schema for entity types */
export const entityTypeSchema = z.enum(appConfig.entityTypes);

/** Enum schema for channel entity types */
export const channelEntityTypeSchema = z.enum(appConfig.channelEntityTypes);

/** Enum schema for product entity types */
export const productEntityTypeSchema = z.enum(appConfig.productEntityTypes);

// Common param schemas

/** Schema for an entity ID with max length */
export const validIdSchema = z.string().max(maxLength.id);

/** Schema for an optimistic-create ID that must start with 'temp-'. */
export const validTempIdSchema = z
  .string()
  .max(maxLength.id)
  .regex(/^temp-/, { message: 'ID must start with "temp-"' });

/** Schema for a cookie value */
export const cookieSchema = z.string().max(maxLength.field);

/** Schema for session cookie */
export const sessionCookieSchema = z.object({
  sessionToken: z.string().max(maxLength.field),
  sessionId: z.string().max(maxLength.id),
  adminUserId: z.string().max(maxLength.id).optional(),
});

/** Schema for supported languages (enum) */
export const languageSchema = z.enum(appConfig.languages);

/** Schema for entity identifier id */
export const entityIdParamSchema = z.object({ id: validIdSchema });

/** Schema for optional slug query flag; true resolves the entity by slug, not ID. */
export const slugQuerySchema = z.object({ slug: booleanTransformSchema.optional() });

/** Schema for tenant-scoped entity id (for organization routes) */
export const tenantIdParamSchema = z.object({
  tenantId: validIdSchema,
  id: validIdSchema,
});

/** Schema for tenant-only param (no entity id) */
export const tenantOnlyParamSchema = z.object({
  tenantId: validIdSchema,
});

/** Schema for an organization identifier organizationId */
export const inOrgParamSchema = z.object({ organizationId: validIdSchema });

/** Schema for entity id within an organization organizationId */
export const idInOrgParamSchema = z.object({ id: validIdSchema, organizationId: validIdSchema });

// Tenant-scoped param schemas (for RLS-enabled routes)

/** Schema for tenant-scoped routes: tenantId + organizationId */
export const tenantOrgParamSchema = z.object({
  tenantId: validIdSchema,
  organizationId: validIdSchema,
});

/** Schema for entity id within tenant + org context */
export const idInTenantOrgParamSchema = z.object({
  tenantId: validIdSchema,
  organizationId: validIdSchema,
  id: validIdSchema,
});

/** Schema for user id within tenant + org context (for getUser route) */
export const userIdInTenantOrgParamSchema = z.object({
  tenantId: validIdSchema,
  organizationId: validIdSchema,
  userId: validIdSchema,
});

/** Schema for relatable user id param (cross-tenant routes with relatability check) */
export const relatableUserIdParamSchema = z.object({
  relatableUserId: validIdSchema,
});

// Common query schemas

/** Schema for id that must be a specific entity type */
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

/** Schema for pagination query parameters */
export const paginationQuerySchema = z.object({
  q: z.string().max(maxLength.field).optional(), // Optional search query
  sort: z.enum(['createdAt']).default('createdAt'), // Sorting field
  order: z.enum(['asc', 'desc']).default('desc'), // Sorting order
  // Pagination offset
  offset: integerQuerySchema(0, t('error:invalid_offset')),
  // Pagination limit
  limit: integerQuerySchema(appConfig.requestLimits.default, t('error:invalid_limit', { max: limitMax })).refine(
    (value) => value > 0 && value <= limitMax,
    t('error:invalid_limit', { max: limitMax }),
  ),
  /** Org-sequence delta filter: bounded inclusive range "51,150" (seq >= 51 AND <= 150). */
  seqCursor: seqCursorSchema.optional(),
});

/** Schema for optional excludeArchived query param (transforms to boolean) */
export const excludeArchivedQuerySchema = z
  .enum(['true', 'false'])
  .optional()
  .transform((val) => val === 'true');

/** Schema for optional fullResponse query param; true returns fully hydrated relations. */
export const fullResponseQuerySchema = z.object({
  fullResponse: booleanTransformSchema.optional(),
});

/** Valid options for include query param */
export const includeOptions = ['counts', 'membership', 'members'] as const;
export type IncludeOption = (typeof includeOptions)[number];

/**
 * Schema for comma-separated include query param.
 * Usage: ?include=counts or ?include=counts,membership
 * Transforms to array of validated options.
 */
export const includeQuerySchema = z
  .string()
  .optional()
  .transform((val) => (val ? val.split(',').map((s) => s.trim()) : []))
  .pipe(z.array(z.enum(includeOptions)));

/** Schema for slug + include query params used by single-get channel entity routes. */
export const slugIncludeQuerySchema = z.object({
  slug: booleanTransformSchema.optional(),
  include: includeQuerySchema,
});

export const emailOrTokenIdQuerySchema = z.union([
  z.object({ email: z.email({ message: t('error:invalid_email') }), tokenId: z.string().optional() }),
  z.object({ email: z.email().optional(), tokenId: z.string() }),
]);

// Common body schemas

/** Schema for a request body containing an array of IDs */
export const idsBodySchema = (maxItems = 50) =>
  z.object({
    ids: z
      .array(z.string())
      .min(1, t('error:invalid_min_items', { min: 'one', name: 'ID' }))
      .max(maxItems, t('error:invalid_max_items', { max: maxItems, name: 'ID' })),
  });

/** Schema for a request body containing IDs with optional stx for echo prevention */
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

/** Schema for a redirect header */
export const locationSchema = z.object({ Location: z.string() });

// Validation schemas (for create and update)

/**
 * Creates a superRefine validator that passes a custom error type for i18n translation.
 * The error type is passed via params.type and extracted by defaultHook.
 * @param check - Validation function returning true if valid
 * @param errorType - Translation key (e.g., 'invalid_slug') used as error type
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

/** Schema for a client-provided entity ID: valid UUID format */
export const validUuidSchema = z.string().uuid({ message: t('error:invalid_id') });

/** Refinement that rejects arrays with duplicate slug values */
export const noDuplicateSlugsRefine = (items: { slug: string }[]) =>
  new Set(items.map((i) => i.slug)).size === items.length;

/** Schema for a valid HTTPS URL */
export const validUrlSchema = z
  .string()
  .max(maxLength.url)
  .startsWith('https://', { message: t('error:invalid_url') })
  .superRefine(refineWithType((url: string) => url.startsWith('https://'), 'invalid_url'))
  .transform((str) => str.toLowerCase().trim());

/** Schema for a valid name: string between 2 and max field length, allowing specific characters */
export const validNameSchema = z
  .string()
  .min(2, t('error:invalid_between_num', { name: 'Name', min: 2, max: maxLength.field }))
  .max(maxLength.field, t('error:invalid_between_num', { name: 'Name', min: 2, max: maxLength.field }))
  .regex(/^[\p{L}\d\-., '&()]+$/u, { message: t('error:invalid_name') })
  .superRefine(refineWithType((s) => /^[\p{L}\d\-., '&()]+$/u.test(s), 'invalid_name'));

/** Schema for a valid email */
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

/** Schema for a canonical DNS hostname containing at least one dot. */
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

/** Schema for a valid slug: string between 2 and max field length, allowing alphanumeric and hyphens */
export const validSlugSchema = z
  .string()
  .min(2, t('error:invalid_between_num', { name: 'Slug', min: 2, max: maxLength.field }))
  .max(maxLength.field, t('error:invalid_between_num', { name: 'Slug', min: 2, max: maxLength.field }))
  .regex(/^[a-z0-9]+(-{0,3}[a-z0-9]+)*$/i, { message: t('error:invalid_slug') })
  .superRefine(refineWithType((s) => /^[a-z0-9]+(-{0,3}[a-z0-9]+)*$/i.test(s), 'invalid_slug'))
  .transform((str) => str.toLowerCase().trim());

/**
 * Schema for a valid CDN URL.
 * Kept as `superRefine` because the allowed CDN hosts come from runtime config
 * and cannot be expressed as a static JSON-schema pattern.
 */
export const validCDNUrlSchema = z
  .string()
  .max(maxLength.url)
  .superRefine(refineWithType((url: string) => isCDNUrl(url), 'invalid_cdn_url'))
  .transform((str) => str.trim());

/** Schema for an optional array of canonical DNS hostnames. */
export const validDomainsSchema = validDomainSchema.array().optional();
