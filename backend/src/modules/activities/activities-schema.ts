import { z } from '@hono/zod-openapi';
import { activityActions, appConfig, trackedEventTypes } from 'shared';
import { createSelectSchema } from '#/db/utils/drizzle-schema';
import { activitiesTable } from '#/modules/activities/activities-db';
import { entityTypeSchema, paginationQuerySchema } from '#/schemas';
import { nullableStxBaseSchema } from '#/schemas/sync-transaction-schemas';
import { mockActivityResponse } from './activities-mocks';

/** Schema for activity actions enum - uses literal types from activityActions */
export const activityActionSchema = z.enum(activityActions);

/** Schema for resource types enum - uses literal types from appConfig */
const resourceTypeSchema = z.enum(appConfig.resourceTypes);

/** Schema for activity event types enum - uses literal types from trackedEventTypes */
const activityEventTypeSchema = z.enum(trackedEventTypes);

/** Full activity schema derived from table, with proper stx and changedFields typing */
export const activitySchema = z
  .object({
    ...createSelectSchema(activitiesTable).shape,
    // Override enum columns with explicit schemas to preserve literal types for OpenAPI/Drizzle compatibility
    entityType: entityTypeSchema.nullable(),
    resourceType: resourceTypeSchema.nullable(),
    action: activityActionSchema,
    type: activityEventTypeSchema,
    // Override jsonb columns with properly typed schemas to avoid generic types in OpenAPI
    changedFields: z.array(z.string()).nullable(),
    stx: nullableStxBaseSchema,
  })
  .openapi('Activity', {
    description: 'An auditable event recording an entity change, used for sync and history.',
    example: mockActivityResponse(),
  });

/** Query schema for filtering and paginating activities */
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
