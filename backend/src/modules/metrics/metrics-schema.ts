import { z } from '@hono/zod-openapi';
import { mapEntitiesToSchema } from '#/utils/schema/entities-to-schema';

export const publicCountsSchema = mapEntitiesToSchema(() => z.number());

export const metricListSchema = z.array(
  z.object({
    date: z.string(),
    count: z.number(),
  }),
);
