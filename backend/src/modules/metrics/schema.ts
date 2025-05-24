import { z } from 'zod';
import { mapEntitiesToSchema } from '#/utils/schema/entities-to-schema';

export const metricPublicSchema = mapEntitiesToSchema(() => z.number());

export const metricListSchema = z.array(
  z.object({
    date: z.string(),
    count: z.number(),
  }),
);
