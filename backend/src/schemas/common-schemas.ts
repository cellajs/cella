import { z } from '@hono/zod-openapi';
import { t } from 'i18next';
import { appConfig } from 'shared';
import { maxLength } from '#/db/utils/constraints';
import { isCDNUrl } from '#/utils/is-cdn-url';

export { maxLength };

/** Schema to use boolean parameters (transform string to boolean) */
export const booleanTransformSchema = z
  .union([z.string(), z.boolean()])
  .default('false')
  .transform((v) => v === true || v === 'true')
  .pipe(z.boolean());

/*************************************************************************************************
 * Entity schemas
 ************************************************************************************************/

/** Enum schema for entity types */
export const entityTypeSchema = z.enum(appConfig.entityTypes);

/** Enum schema for context entity types */
export const contextEntityTypeSchema = z.enum(appConfig.contextEntityTypes);

/** Enum schema for product entity types */
export const productEntityTypeSchema = z.enum(appConfig.productEntityTypes);

/*************************************************************************************************
 * Common properties schemas
 ************************************************************************************************/

/** Schema for entity action permissions (`can` object) */
export const entityCanSchema = z.object({
  create: z.boolean(),
  read: z.boolean(),
  update: z.boolean(),
  delete: z.boolean(),
  search: z.boolean(),
});

/*************************************************************************************************
 * Common param schemas
 ************************************************************************************************/

/** Schema for an entity ID with max length */
export const validIdSchema = z.string().max(maxLength.id);

/** Schema for a temporary ID (must start with 'temp-') used for optimistic creates */
export const validTempIdSchema = z
  .string()
  .max(maxLength.id)
  .regex(/^temp-/, { message: 'ID must start with "temp-"' });

/** Schema for a cookie value */
export const cookieSchema = z.string().max(maxLength.field);

/** Schema for session cookie */
export const sessionCookieSchema = z.object({
  sessionToken: z.string().max(maxLength.field),
  adminUserId: z.string().max(maxLength.id).optional(),
});

/** Password schema: string - min 8 - max characters */
export const passwordSchema = z.string().min(8).max(maxLength.password);

/** Schema for supported languages (enum) */
export const languageSchema = z.enum(appConfig.languages);

/** Schema for entity identifier id */
export const entityIdParamSchema = z.object({ id: validIdSchema });

/** Schema for optional slug query flag — when true, resolve entity by slug instead of ID */
export const slugQuerySchema = z.object({ slug: booleanTransformSchema.optional() });

/** Schema for tenant-scoped organization id (for getOrganization route) */
export const tenantOrganizationIdParamSchema = z.object({
  tenantId: validIdSchema,
  organizationId: validIdSchema,
});

/** Schema for tenant-scoped entity id (for organization routes) */
export const tenantIdParamSchema = z.object({
  tenantId: validIdSchema,
  id: validIdSchema,
});

/** Schema for tenant-only param (no entity id) */
export const tenantOnlyParamSchema = z.object({
  tenantId: validIdSchema,
});

/** Schema for an organization identifier orgId */
export const inOrgParamSchema = z.object({ orgId: validIdSchema });

/** Schema for entity id within an organization orgId */
export const idInOrgParamSchema = z.object({ id: validIdSchema, orgId: validIdSchema });

/*************************************************************************************************
 * Tenant-scoped param schemas (for RLS-enabled routes)
 ************************************************************************************************/

/** Schema for tenant-scoped routes: tenantId + orgId */
export const tenantOrgParamSchema = z.object({
  tenantId: validIdSchema,
  orgId: validIdSchema,
});

/** Schema for entity id within tenant + org context */
export const idInTenantOrgParamSchema = z.object({
  tenantId: validIdSchema,
  orgId: validIdSchema,
  id: validIdSchema,
});

/** Schema for user id within tenant + org context (for getUser route) */
export const userIdInTenantOrgParamSchema = z.object({
  tenantId: validIdSchema,
  orgId: validIdSchema,
  userId: validIdSchema,
});

/*************************************************************************************************
 * Common query schemas
 ************************************************************************************************/

/** Schema for id that must be a specific entity type */
export const entityWithTypeQuerySchema = z.object({ entityId: validIdSchema, entityType: contextEntityTypeSchema });

const offsetRefine = (value: number) => value >= 0;
const limitMax = 1000;
const limitRefine = (value: number) => value > 0 && value <= limitMax;

/** Schema for pagination query parameters */
export const paginationQuerySchema = z.object({
  q: z.string().max(maxLength.field).optional(), // Optional search query
  sort: z.enum(['createdAt']).default('createdAt').optional(), // Sorting field
  order: z.enum(['asc', 'desc']).default('asc').optional(), // Sorting order
  // Pagination offset
  offset: z
    .string()
    .optional()
    .transform((val) => (val ? Number.parseInt(val, 10) : 0)) // convert to number
    .refine(offsetRefine, t('error:invalid_offset')),
  // Pagination limit
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? Number.parseInt(val, 10) : appConfig.requestLimits.default)) // convert to number
    .refine(limitRefine, t('error:invalid_limit', { max: limitMax })),
});

/** Schema for optional excludeArchived query param (transforms to boolean) */
export const excludeArchivedQuerySchema = z
  .enum(['true', 'false'])
  .optional()
  .transform((val) => val === 'true');

/** Valid options for include query param */
export const includeOptions = ['counts', 'membership'] as const;
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

export const emailOrTokenIdQuerySchema = z.union([
  z.object({ email: z.email({ message: t('error:invalid_email') }), tokenId: z.string().optional() }),
  z.object({ email: z.email().optional(), tokenId: z.string() }),
]);

/*************************************************************************************************
 * Common body schemas
 ************************************************************************************************/

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

/*************************************************************************************************
 * Common headers schemas
 ************************************************************************************************/

/** Schema for a redirect header */
export const locationSchema = z.object({ Location: z.string() });

/*************************************************************************************************
 * Validation schemas (for create and update)
 ************************************************************************************************/

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

/** Refinement that rejects arrays with duplicate slug values */
export const noDuplicateSlugsRefine = (items: { slug: string }[]) =>
  new Set(items.map((i) => i.slug)).size === items.length;

/** Schema for a valid HTTPS URL */
export const validUrlSchema = z
  .string()
  .max(maxLength.url)
  .superRefine(refineWithType((url: string) => url.startsWith('https'), 'invalid_url'))
  .transform((str) => str.toLowerCase().trim());

/** Schema for a valid name: string between 2 and max field length, allowing specific characters */
export const validNameSchema = z
  .string()
  .min(2, t('error:invalid_between_num', { name: 'Name', min: 2, max: maxLength.field }))
  .max(maxLength.field, t('error:invalid_between_num', { name: 'Name', min: 2, max: maxLength.field }))
  .superRefine(refineWithType((s) => /^[\p{L}\d\-., '&()]+$/u.test(s), 'invalid_name'));

/** Schema for a valid email */
export const validEmailSchema = z
  .email({ message: t('error:invalid_email') })
  .min(4, t('error:invalid_between_num', { name: 'Email', min: 4, max: maxLength.field }))
  .max(maxLength.field, t('error:invalid_between_num', { name: 'Email', min: 4, max: maxLength.field }))
  .transform((str) => str.toLowerCase().trim());

/** Schema for a valid slug: string between 2 and max field length, allowing alphanumeric and hyphens */
export const validSlugSchema = z
  .string()
  .min(2, t('error:invalid_between_num', { name: 'Slug', min: 2, max: maxLength.field }))
  .max(maxLength.field, t('error:invalid_between_num', { name: 'Slug', min: 2, max: maxLength.field }))
  .superRefine(refineWithType((s) => /^[a-z0-9]+(-{0,3}[a-z0-9]+)*$/i.test(s), 'invalid_slug'))
  .transform((str) => str.toLowerCase().trim());

export const validCDNUrlSchema = z
  .string()
  .max(maxLength.url)
  .superRefine(refineWithType((url: string) => isCDNUrl(url), 'invalid_cdn_url'))
  .transform((str) => str.trim());

/** Schema for an array of valid domains */
export const validDomainsSchema = z
  .array(
    z
      .string()
      .min(4, t('error:invalid_between_num', { name: 'Domain', min: 4, max: maxLength.field }))
      .max(maxLength.field, t('error:invalid_between_num', { name: 'Domain', min: 4, max: maxLength.field }))
      .superRefine(refineWithType((s) => /^[a-z0-9].*[a-z0-9]$/i.test(s) && s.includes('.'), 'invalid_domain'))
      .transform((str) => str.toLowerCase().trim()),
  )
  .optional();
