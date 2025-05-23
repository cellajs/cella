import { z } from 'zod';
import { mapEntitiesSchema } from '#/utils/schema/schema';

export const metricPublicSchema = mapEntitiesSchema(() => z.number());

export const metricListSchema = z.array(
  z.object({
    date: z.string(),
    count: z.number(),
  }),
);
