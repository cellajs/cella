import { z } from '@hono/zod-openapi';
import { appConfig } from 'config';

/*************************************************************************************************
 * Entity schemas
 ************************************************************************************************/

/** Enum schema for entity types */
export const entityTypeSchema = z.enum(appConfig.entityTypes);

/** Enum schema for page entity types */
export const pageEntityTypeSchema = z.enum(appConfig.pageEntityTypes);

/** Enum schema for context entity types */
export const contextEntityTypeSchema = z.enum(appConfig.contextEntityTypes);

/** Enum schema for product entity types */
export const productEntityTypeSchema = z.enum(appConfig.productEntityTypes);

/*************************************************************************************************
 * Common properties schemas
 ************************************************************************************************/

/** Schema for a generic name (string) */
export const nameSchema = z.string();

/** Schema for an entity ID (string) */
export const idSchema = z.string();

/** Schema for a slug (string) */
export const slugSchema = z.string();

/** Schema for an image URL (string) */
export const imageUrlSchema = z.string();

/** Schema for a cookie value (string) */
export const cookieSchema = z.string();

/** Schema for either an ID or a slug */
export const idOrSlugSchema = idSchema.or(slugSchema);

/** Password schema: string - min 8 - max 100 characters */
export const passwordSchema = z.string().min(8).max(100);

/** Schema for supported languages (enum) */
export const languageSchema = z.enum(appConfig.languages);

/*************************************************************************************************
 * Common param schemas
 ************************************************************************************************/

/** Schema for authentication token parameter (token string) */
export const tokenParamSchema = z.object({ token: z.string() });

/** Schema for entity identifier idOrSlug */
export const entityParamSchema = z.object({ idOrSlug: idOrSlugSchema });

/** Schema for an organization identifier idOrSlug */
export const inOrgParamSchema = z.object({ orgIdOrSlug: idOrSlugSchema });

/** Schema for an entity idOrSlug within an organization orgIdOrSlug */
export const entityInOrgParamSchema = z.object({ idOrSlug: idOrSlugSchema, orgIdOrSlug: idOrSlugSchema });

/** Schema for an entity id within an organization orgIdOrSlug */
export const idInOrgParamSchema = z.object({ id: idSchema, orgIdOrSlug: idOrSlugSchema });

/*************************************************************************************************
 * Common query schemas
 ************************************************************************************************/

/** Schema for idOrSlug that must be a specific entity type */
export const entityWithTypeQuerySchema = z.object({ idOrSlug: idOrSlugSchema, entityType: contextEntityTypeSchema });

/** Schema to use boolean query parameters (transform string to boolean) */
export const booleanQuerySchema = z
  .union([z.string(), z.boolean()])
  .default('false')
  .transform((v) => v === true || v === 'true')
  .pipe(z.boolean());

const offsetRefine = (value: number) => value >= 0;
const limitRefine = (value: number) => value > 0 && value <= 1000;

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
    .refine(offsetRefine, 'Must be number greater or equal to 0'),
  // Pagination limit
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? Number.parseInt(val, 10) : appConfig.requestLimits.default)) // convert to number
    .refine(limitRefine, 'Must be a number greater than 0 and less than or equal to 1000'),
});

/*************************************************************************************************
 * Common body schemas
 ************************************************************************************************/

/** Schema for a request body containing an array of IDs */
export const idsBodySchema = (maxItems = 50) =>
  z.object({
    ids: z.array(z.string()).min(1, 'Add at least one item').max(maxItems, `The number of items cannot exceed ${maxItems}`),
  });

/*************************************************************************************************
 * Validation schemas (for create and update)
 ************************************************************************************************/

/** Schema for a valid HTTPS URL */
export const validUrlSchema = z
  .string()
  .refine((url: string) => url.startsWith('https'), 'URL must start with https://')
  .transform((str) => str.toLowerCase().trim());

/** Schema for a valid name: string between 2 and 100 characters, allowing specific characters */
export const validNameSchema = z
  .string()
  .min(2, 'Name must be between 2 and 100 characters')
  .max(100, 'Name must be between 2 and 100 characters')
  .refine(
    (s) => /^[\p{L}\d\-., '&()]+$/u.test(s), // Allow only specified characters
    "Name may only contain letters, numbers, spaces, and these characters: .,'-&()",
  );

/** Schema for a valid email */
export const validEmailSchema = z
  .string()
  .min(4, 'Email must be between 4 and 100 characters')
  .max(100, 'Email must be between 4 and 100 characters')
  .transform((str) => str.toLowerCase().trim());

/** Schema for a valid slug: string between 2 and 100 characters, allowing alphanumeric and hyphens */
export const validSlugSchema = z
  .string()
  .min(2, 'Slug must be between 2 and 100 characters')
  .max(100, 'Slug must be between 2 and 100 characters')
  .refine(
    (s) => /^[a-z0-9]+(-{0,3}[a-z0-9]+)*$/i.test(s),
    'Slug may only contain alphanumeric characters or up to three hyphens, and cannot begin or end with a hyphen.',
  )
  .transform((str) => str.toLowerCase().trim());

export const validImageKeySchema = z.string();

/** Schema for an array of valid domains */
export const validDomainsSchema = z
  .array(
    z
      .string()
      .min(4, 'Domain must be between 4 and 100 characters')
      .max(100, 'Domain must be between 4 and 100 characters')
      .refine(
        (s) => /^[a-z0-9].*[a-z0-9]$/i.test(s) && s.includes('.'),
        'Domain must not contain @, no special chars and at least one dot (.) in between.',
      )
      .transform((str) => str.toLowerCase().trim()),
  )
  .optional();

/**
 * Schema for Electric sync target query parameters.
 * These are typically passed as query string parameters to define
 * the shape of a synchronization query used by ElectricSQL.
 */
export const baseElectrycSyncQuery = z.object({
  table: z.string(),
  offset: z.string(),
  handle: z.string().optional(),
  cursor: z.string().optional(),
  live: z.string().optional(),
  where: z.string().optional(),
});
