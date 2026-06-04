import { z } from '@hono/zod-openapi';
import { activityActions, activityEventTypes, appConfig } from 'shared';
import { activitiesTable } from '#/db/schema/activities';
import { createSelectSchema } from '#/db/utils/drizzle-schema';
import { paginationQuerySchema } from '#/schemas';
import { stxBaseSchema } from '#/schemas/sync-transaction-schemas';
import { mockActivityResponse } from '../../../mocks/mock-activity';

/** Schema for activity actions enum - uses literal types from activityActions */
export const activityActionSchema = z.enum(activityActions);

/** Schema for entity types enum - uses literal types from appConfig */
export const entityTypeSchema = z.enum(appConfig.entityTypes);

/** Schema for resource types enum - uses literal types from appConfig */
const resourceTypeSchema = z.enum(appConfig.resourceTypes);

/** Schema for activity event types enum - uses literal types from activityEventTypes */
const activityEventTypeSchema = z.enum(activityEventTypes);

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
    // Use union instead of .nullable() to generate proper anyOf in OpenAPI (avoids allOf intersection issue)
    stx: z.union([stxBaseSchema, z.null()]),
  })
  .openapi('Activity', {
    description: 'An auditable event recording an entity change, used for sync and history.',
    example: mockActivityResponse(),
  });

/** Query schema for filtering and paginating activities */
export const activityListQuerySchema = paginationQuerySchema.extend({
  sort: z.enum(['createdAt', 'type', 'tableName']).default('createdAt').optional(),
  userId: activitySchema.shape.userId,
  entityType: entityTypeSchema.optional(),
  resourceType: resourceTypeSchema.optional(),
  action: activityActionSchema.optional(),
  tableName: activitySchema.shape.tableName.optional(),
  type: activityEventTypeSchema.optional(),
  subjectId: activitySchema.shape.subjectId,
});
