import { z } from '@hono/zod-openapi';
import { appConfig } from 'config';
import { t } from 'i18next';
import { isCDNUrl } from '#/utils/is-cdn-url';

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

/** Schema for a generic name (string) */
export const nameSchema = z.string();

/** Schema for entity action permissions (`can` object) */
export const entityCanSchema = z.object({
  create: z.boolean(),
  read: z.boolean(),
  update: z.boolean(),
  delete: z.boolean(),
  search: z.boolean(),
});

/** Schema for an entity ID (string) */
export const idSchema = z.string();

/** Schema for a temporary ID (must start with 'temp-') used for optimistic creates */
export const validTempIdSchema = z.string().regex(/^temp-/, { message: 'ID must start with "temp-"' });

/** Schema for a slug (string) */
export const slugSchema = z.string();

/** Schema for an image URL (string) */
export const imageUrlSchema = z.string();

/** Schema for a cookie value (string) */
export const cookieSchema = z.string();

/** Schema for session cookie */
export const sessionCookieSchema = z.object({ sessionToken: z.string(), adminUserId: z.string().optional() });

/** Password schema: string - min 8 - max 100 characters */
export const passwordSchema = z.string().min(8).max(100);

/** Schema for supported languages (enum) */
export const languageSchema = z.enum(appConfig.languages);

/*************************************************************************************************
 * Common param schemas
 ************************************************************************************************/

/** Schema for entity identifier id */
export const entityIdParamSchema = z.object({ id: idSchema });

/** Schema for entity identifier id or slug */
export const entityIdOrSlugParamSchema = z.object({ idOrSlug: idSchema });

/** Schema for an organization identifier orgId */
export const inOrgParamSchema = z.object({ orgId: idSchema });

/** Schema for entity id within an organization orgId */
export const idInOrgParamSchema = z.object({ id: idSchema, orgId: idSchema });

/*************************************************************************************************
 * Common query schemas
 ************************************************************************************************/

/** Schema for id that must be a specific entity type */
export const entityWithTypeQuerySchema = z.object({ entityId: idSchema, entityType: contextEntityTypeSchema });

const offsetRefine = (value: number) => value >= 0;
const limitMax = 1000;
const limitRefine = (value: number) => value > 0 && value <= limitMax;

/** Schema for pagination query parameters */
export const paginationQuerySchema = z.object({
  q: z.string().optional(), // Optional search query
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

/** Valid options for include query param */
export const includeOptions = ['counts'] as const;
export type IncludeOption = (typeof includeOptions)[number];

/**
 * Schema for comma-separated include query param.
 * Usage: ?include=counts or ?include=counts,stats
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

/** Schema for a request body containing IDs with optional tx for echo prevention */
export const idsWithTxBodySchema = (maxItems = 50) =>
  z.object({
    ids: z
      .array(z.string())
      .min(1, t('error:invalid_min_items', { min: 'one', name: 'ID' }))
      .max(maxItems, t('error:invalid_max_items', { max: maxItems, name: 'ID' })),
    tx: z
      .object({
        id: z.string(),
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

/** Schema for a valid HTTPS URL */
export const validUrlSchema = z
  .string()
  .superRefine(refineWithType((url: string) => url.startsWith('https'), 'invalid_url'))
  .transform((str) => str.toLowerCase().trim());

/** Schema for a valid name: string between 2 and 100 characters, allowing specific characters */
export const validNameSchema = z
  .string()
  .min(2, t('error:invalid_between_num', { name: 'Name', min: 2, max: 100 }))
  .max(100, t('error:invalid_between_num', { name: 'Name', min: 2, max: 100 }))
  .superRefine(refineWithType((s) => /^[\p{L}\d\-., '&()]+$/u.test(s), 'invalid_name'));

/** Schema for a valid email */
export const validEmailSchema = z
  .email({ message: t('error:invalid_email') })
  .min(4, t('error:invalid_between_num', { name: 'Email', min: 4, max: 100 }))
  .max(100, t('error:invalid_between_num', { name: 'Email', min: 4, max: 100 }))
  .transform((str) => str.toLowerCase().trim());

/** Schema for a valid slug: string between 2 and 100 characters, allowing alphanumeric and hyphens */
export const validSlugSchema = z
  .string()
  .min(2, t('error:invalid_between_num', { name: 'Slug', min: 2, max: 100 }))
  .max(100, t('error:invalid_between_num', { name: 'Slug', min: 2, max: 100 }))
  .superRefine(refineWithType((s) => /^[a-z0-9]+(-{0,3}[a-z0-9]+)*$/i.test(s), 'invalid_slug'))
  .transform((str) => str.toLowerCase().trim());

export const validCDNUrlSchema = z
  .string()
  .superRefine(refineWithType((url: string) => isCDNUrl(url), 'invalid_cdn_url'))
  .transform((str) => str.trim());

/** Schema for an array of valid domains */
export const validDomainsSchema = z
  .array(
    z
      .string()
      .min(4, t('error:invalid_between_num', { name: 'Domain', min: 4, max: 100 }))
      .max(100, t('error:invalid_between_num', { name: 'Domain', min: 4, max: 100 }))
      .superRefine(refineWithType((s) => /^[a-z0-9].*[a-z0-9]$/i.test(s) && s.includes('.'), 'invalid_domain'))
      .transform((str) => str.toLowerCase().trim()),
  )
  .optional();
