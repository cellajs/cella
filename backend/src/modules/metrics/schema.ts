import { z } from 'zod';
import { createEntitiesSchema } from '#/lib/schema-utils';

export const publicCountsSchema = createEntitiesSchema(() => z.number());

export const metricsSchema = z.array(
  z.object({
    date: z.string(),
    count: z.number(),
  }),
);
