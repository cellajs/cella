import { z } from '@hono/zod-openapi';
import { appConfig } from 'shared';
import { validSlugSchema } from '#/schemas';

export const checkSlugBodySchema = z.object({
  slug: validSlugSchema,
  entityType: z.enum(appConfig.channelEntityTypes),
});

/** View count from product counters, present on product reads that join or fetch them. */
export const productViewCountSchema = z.number().int().min(0).optional();
