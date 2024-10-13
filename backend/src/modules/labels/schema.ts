import { z } from 'zod';

import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { labelsTable } from '#/db/schema/labels';
import { paginationQuerySchema } from '#/utils/schema/common-schemas';

export const createLabelSchema = createInsertSchema(labelsTable).omit({
  id: true,
  lastUsedAt: true,
  createdAt: true,
  createdBy: true,
  modifiedAt: true,
  modifiedBy: true,
  entity: true,
  organizationId: true,
});

export const labelSchema = z.object({
  ...createSelectSchema(labelsTable).omit({
    lastUsedAt: true,
    entity: true,
    createdAt: true,
    createdBy: true,
    modifiedAt: true,
    modifiedBy: true,
  }).shape,
  lastUsedAt: z.string(),
});

export const updateLabelSchema = z.object({
  useCount: z.number(),
});

export const getLabelsQuerySchema = paginationQuerySchema.merge(
  z.object({
    projectId: z.string(),
    q: z.string().optional(),
    sort: z.enum(['name', 'useCount', 'lastUsedAt']).default('name').optional(),
    order: z.enum(['asc', 'desc']).default('asc').optional(),
  }),
);
