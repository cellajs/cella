import { z } from 'zod';

export const passwordSchema = z.string().min(8).max(100);

export const cookieSchema = z.string();

export const errorResponseSchema = z.object({
  success: z.boolean().default(false),
  error: z.string(),
});

export const paginationQuerySchema = z.object({
  q: z.string().optional(),
  sort: z.enum(['id']).optional().default('id'),
  order: z.enum(['asc', 'desc']).optional().default('asc'),
  offset: z
    .string()
    .optional()
    .default('0')
    .refine((value) => {
      if (!Number.isNaN(Number(value)) && Number(value) >= 0) {
        return true;
      }

      return false;
    }, 'Must be a number greater than or equal to 0'),
  limit: z
    .string()
    .optional()
    .default('50')
    .refine((value) => {
      if (!Number.isNaN(Number(value)) && Number(value) > 0) {
        return true;
      }

      return false;
    }, 'Must be a number greater than 0'),
});

export const idSchema = z.string();

export const slugSchema = z.string();
