import { z } from 'zod';

import { createSelectSchema } from 'drizzle-zod';
import { labelsTable } from '../../db/schema/labels';
import { paginationQuerySchema } from '../../lib/common-schemas';

export const responseLabelSchema = z.object({
  ...createSelectSchema(labelsTable).shape,
});

export const createLabelSchema = z.object({
  ...responseLabelSchema.omit({ lastUsed: true, useCount: true }).shape,
});

export const updateLabelSchema = z.object({
  useCount: z.number(),
});

export const getLabelsQuerySchema = paginationQuerySchema.merge(
  z.object({
    projectId: z.string(),
    q: z.string().optional(),
    sort: z.enum(['name']).default('name').optional(),
    order: z.enum(['asc', 'desc']).default('asc').optional(),
  }),
);
