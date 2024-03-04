import { z } from 'zod';

export const passwordSchema = z.string().min(8).max(100);

export const cookieSchema = z.string();

export const errorResponseSchema = z.object({
  success: z.boolean().default(false),
  error: z.string(),
});

const offsetRefine = (value: string) => Number(value) >= 0;
const limitRefine = (value: string) => Number(value) > 0;

export const paginationQuerySchema = z.object({
  q: z.string().optional().catch(''),
  sort: z.enum(['createdAt']).optional().catch('createdAt'),
  order: z.enum(['asc', 'desc']).optional().catch('asc'),
  offset: z.string().optional().default('0').refine(offsetRefine, 'Must be number greater or equal to 0'),
  limit: z.string().optional().default('50').refine(limitRefine, 'Must be number greater than 0'),
});

export const idSchema = z.string();

export const slugSchema = z.string();

export const validSlugSchema = z
  .string()
  .refine(
    (s) => /^[a-z0-9]+(-[a-z0-9]+)*$/i.test(s),
    'Slug may only contain alphanumeric characters or single hyphens, and cannot begin or end with a hyphen.',
  );

export const imageUrlSchema = z
  .string()
  .url()
  .refine((url) => new URL(url).search === '', 'Search params not allowed');

export const nameSchema = z.string().refine((s) => /^[a-z ,.'-]+$/i.test(s), "Name may only contain letters, spaces and these characters: ,.'-");
