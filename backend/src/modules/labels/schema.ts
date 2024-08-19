import { z } from 'zod';

import { createSelectSchema } from 'drizzle-zod';
import { labelsTable } from '../../db/schema/labels';
import { paginationQuerySchema } from '../../lib/common-schemas';

export const labelSchema = z.object({
  ...createSelectSchema(labelsTable).omit({ lastUsed: true }).shape,
  lastUsed: z.string(),
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
