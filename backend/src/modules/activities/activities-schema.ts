import { z } from '@hono/zod-openapi';
import { appConfig } from 'shared';
import { activitiesTable } from '#/db/schema/activities';
import { activityErrorSchema } from '#/db/utils/activity-error-schema';
import { createSelectSchema } from '#/db/utils/drizzle-schema';
import { paginationQuerySchema } from '#/schemas';
import { stxBaseSchema } from '#/schemas/sync-transaction-schemas';
import { activityActions } from '#/sync/activity-bus';
import { mockActivityResponse } from '../../../mocks/mock-activity';

/** Schema for activity actions enum - uses literal types from activityActions */
export const activityActionSchema = z.enum(activityActions);

/** Schema for entity types enum - uses literal types from appConfig */
export const entityTypeSchema = z.enum(appConfig.entityTypes);

/** Schema for resource types enum - uses literal types from appConfig */
export const resourceTypeSchema = z.enum(appConfig.resourceTypes);

// Re-export for convenience
export { activityErrorSchema } from '#/db/utils/activity-error-schema';

/** Full activity schema derived from table, with proper stx and changedKeys typing */
export const activitySchema = z
  .object({
    ...createSelectSchema(activitiesTable).shape,
    // Override enum columns with explicit schemas to preserve literal types for OpenAPI/Drizzle compatibility
    entityType: entityTypeSchema.nullable(),
    resourceType: resourceTypeSchema.nullable(),
    action: activityActionSchema,
    // Override jsonb columns with properly typed schemas to avoid generic types in OpenAPI
    changedKeys: z.array(z.string()).nullable(),
    // Use union instead of .nullable() to generate proper anyOf in OpenAPI (avoids allOf intersection issue)
    stx: z.union([stxBaseSchema, z.null()]),
    error: z.union([activityErrorSchema, z.null()]),
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
  type: activitySchema.shape.type.optional(),
  entityId: activitySchema.shape.entityId,
});
