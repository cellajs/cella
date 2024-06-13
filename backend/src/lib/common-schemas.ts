import { config } from 'config';
import { z } from 'zod';

export const passwordSchema = z.string().min(8).max(100);

export const cookieSchema = z.string();

export const entityTypeSchema = z.enum(config.entityTypes);
export const contextEntityTypeSchema = z.enum(config.contextEntityTypes);

export const idSchema = z.string();

export const slugSchema = z.string();

export const errorSchema = z.object({
  message: z.string(),
  type: z.string(),
  status: z.number(),
  severity: z.string(),
  entityType: entityTypeSchema.optional(),
  logId: z.string().optional(),
  path: z.string().optional(),
  method: z.string().optional(),
  timestamp: z.string().optional(),
  usr: z.string().optional(),
  org: z.string().optional(),
});

export const errorResponseSchema = z.object({
  success: z.boolean().default(false),
  error: errorSchema,
});

const offsetRefine = (value: string | undefined) => Number(value) >= 0;
const limitRefine = (value: string | undefined) => Number(value) > 0;

export const paginationQuerySchema = z.object({
  q: z.string().optional(),
  sort: z.enum(['createdAt']).default('createdAt').optional(),
  order: z.enum(['asc', 'desc']).default('asc').optional(),
  offset: z.string().default('0').optional().refine(offsetRefine, 'Must be number greater or equal to 0'),
  limit: z.string().default('50').optional().refine(limitRefine, 'Must be number greater than 0'),
});

export const deleteByIdsQuerySchema = z.object({
  ids: z.union([z.string(), z.array(z.string())]),
});

export const validSlugSchema = z
  .string()
  .min(2)
  .max(100)
  .refine(
    (s) => /^[a-z0-9]+(-[a-z0-9]+)*$/i.test(s),
    'Slug may only contain alphanumeric characters or single hyphens, and cannot begin or end with a hyphen.',
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

export const entityParamSchema = z.object({
  idOrSlug: idSchema.or(slugSchema),
});

export const countsSchema = z.object({
  memberships: z.object({
    admins: z.number(),
    members: z.number(),
    total: z.number(),
  }),
});

export const imageUrlSchema = z
  .string()
  .url()
  .refine((url) => new URL(url).search === '', 'Search params not allowed');

export const nameSchema = z
  .string()
  .min(2)
  .max(100)
  .refine((s) => /^[a-z ,.'-]+$/i.test(s), "Name may only contain letters, spaces and these characters: ,.'-");

export const colorSchema = z
  .string()
  .min(3)
  .max(7)
  .regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/, 'Color may only contain letters, numbers & starts with #');

export const validUrlSchema = z
  .string()
  .refine((url: string) => url.startsWith('https'), 'URL must start with https://');
