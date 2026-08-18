import { z } from '@hono/zod-openapi';
import { activityActions, appConfig, trackedEventTypes } from 'shared';
import { createSelectSchema } from '#/db/utils/drizzle-schema';
import { activitiesTable } from '#/modules/activities/activities-db';
import { entityTypeSchema, paginationQuerySchema } from '#/schemas';
import { nullableStxBaseSchema } from '#/schemas/sync-transaction-schemas';
import { mockActivityResponse } from './activities-mocks';

export const activityActionSchema = z.enum(activityActions);

const resourceTypeSchema = z.enum(appConfig.resourceTypes);

const activityEventTypeSchema = z.enum(trackedEventTypes);

export const activitySchema = z
  .object({
    ...createSelectSchema(activitiesTable).shape,
    // Explicit enum and jsonb schemas keep literal types in OpenAPI
    entityType: entityTypeSchema.nullable(),
    resourceType: resourceTypeSchema.nullable(),
    action: activityActionSchema,
    type: activityEventTypeSchema,
    changedFields: z.array(z.string()).nullable(),
    stx: nullableStxBaseSchema,
  })
  .openapi('Activity', {
    description: 'An auditable event recording an entity change, used for sync and history.',
    example: mockActivityResponse(),
  });

export const activityListQuerySchema = paginationQuerySchema.extend({
  sort: z.enum(['createdAt', 'type', 'tableName']).default('createdAt'),
  userId: activitySchema.shape.userId.optional(),
  entityType: entityTypeSchema.optional(),
  resourceType: resourceTypeSchema.optional(),
  action: activityActionSchema.optional(),
  tableName: activitySchema.shape.tableName.optional(),
  type: activityEventTypeSchema.optional(),
  subjectId: activitySchema.shape.subjectId.optional(),
});
