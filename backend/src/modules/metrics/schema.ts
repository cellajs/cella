import { z } from 'zod';
import { mapEntitiesSchema } from '#/utils/schema/schema';

export const publicCountsSchema = mapEntitiesSchema(() => z.number());

export const metricsSchema = z.array(
  z.object({
    date: z.string(),
    count: z.number(),
  }),
);
