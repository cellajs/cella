import { config } from 'config';
import { z } from 'zod';

export const passwordSchema = z.string().min(8).max(100);

export const cookieSchema = z.string();

export const entityTypeSchema = z.enum(config.entityTypes);

export const pageEntityTypeSchema = z.enum(config.pageEntityTypes);

export const contextEntityTypeSchema = z.enum(config.contextEntityTypes);

export const productTypeSchema = z.enum(config.productEntityTypes);

export const idSchema = z.string();

export const slugSchema = z.string();

export const idOrSlugSchema = idSchema.or(slugSchema);

export const languageSchema = z.enum(config.languages);

export const tokenSchema = z.object({ token: z.string() });

export const imageUrlSchema = z.string();

export const idsBodySchema = z.object({
  ids: z
    .array(z.string())
    .min(1)
    .max(50)
    .refine((ids) => ids.length <= 50, {
      message: 'The number of items cannot exceed 50',
    }),
});

export const entityParamSchema = z.object({ idOrSlug: idOrSlugSchema });

export const entityInOrgParamSchema = z.object({ idOrSlug: idOrSlugSchema, orgIdOrSlug: idOrSlugSchema });

export const productParamSchema = z.object({ id: idSchema, orgIdOrSlug: idOrSlugSchema });

export const validUrlSchema = z.string().refine((url: string) => url.startsWith('https'), 'URL must start with https://');

export const booleanQuerySchema = z
  .union([z.string(), z.boolean()])
  .default('false')
  .transform((v) => v === true || v === 'true');

export const validImageUrlSchema = z
  .string()
  .url()
  .refine((url) => new URL(url).search === '', 'Search params not allowed');

export const errorSchema = z.object({
  message: z.string(),
  type: z.string(),
  status: z.number(),
  severity: z.enum(config.severityLevels),
  entityType: entityTypeSchema.optional(),
  logId: z.string().optional(),
  path: z.string().optional(),
  method: z.string().optional(),
  timestamp: z.string().optional(),
  usr: z.string().optional(),
  org: z.string().optional(),
});

const offsetRefine = (value: string | undefined) => Number(value) >= 0;
const limitRefine = (value: string | undefined) => Number(value) > 0 && Number(value) <= 1000;

export const paginationQuerySchema = z.object({
  q: z.string().optional(),
  sort: z.enum(['createdAt']).default('createdAt').optional(),
  order: z.enum(['asc', 'desc']).default('asc').optional(),
  offset: z.string().default('0').optional().refine(offsetRefine, 'Must be number greater or equal to 0'),
  limit: z
    .string()
    .default(`${config.requestLimits.default}`)
    .optional()
    .refine(limitRefine, 'Must be a number greater than 0 and less than or equal to 1000'),
});

export const validSlugSchema = z
  .string()
  .min(2)
  .max(100)
  .refine(
    (s) => /^[a-z0-9]+(-{0,3}[a-z0-9]+)*$/i.test(s),
    'Slug may only contain alphanumeric characters or up to three hyphens, and cannot begin or end with a hyphen.',
  )
  .transform((str) => str.toLowerCase().trim());

export const validDomainsSchema = z
  .array(
    z
      .string()
      .min(4)
      .max(100)
      .refine(
        (s) => /^[a-z0-9].*[a-z0-9]$/i.test(s) && s.includes('.'),
        'Domain must not contain @, no special chars and at least one dot (.) in between.',
      )
      .transform((str) => str.toLowerCase().trim()),
  )
  .optional();

export const nameSchema = z
  .string()
  .min(2)
  .max(100)
  .refine(
    (s) => /^[\p{L}\d\-., '&()]+$/u.test(s), // Allow any order of the allowed characters
    "Name may only contain letters, numbers, spaces, and these characters: .,'-&()",
  );
