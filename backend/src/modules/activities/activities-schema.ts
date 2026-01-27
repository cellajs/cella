import { z } from '@hono/zod-openapi';
import { createSelectSchema } from 'drizzle-zod';
import { activitiesTable } from '#/db/schema/activities';
import { txBaseSchema } from '#/db/utils/tx-columns';
import { paginationQuerySchema } from '#/schemas';
import { activityActions } from '#/sync/activity-bus';
import { resourceTypes } from '#/table-config';
import { mockActivityResponse } from '../../../mocks/mock-activity';

/** Schema for activity actions enum */
export const activityActionSchema = z.enum(activityActions);

/** Schema for resource types enum */
export const resourceTypeSchema = z.enum(resourceTypes);

/** Full activity schema derived from table, with proper tx typing */
export const activitySchema = z
  .object({
    ...createSelectSchema(activitiesTable).shape,
    tx: txBaseSchema.nullable(),
  })
  .openapi('Activity', { example: mockActivityResponse() });

/** Query schema for filtering and paginating activities */
export const activityListQuerySchema = paginationQuerySchema.extend({
  sort: z.enum(['createdAt', 'type', 'tableName']).default('createdAt').optional(),
  userId: activitySchema.shape.userId,
  entityType: activitySchema.shape.entityType,
  resourceType: activitySchema.shape.resourceType,
  action: activitySchema.shape.action,
  tableName: activitySchema.shape.tableName.optional(),
  type: activitySchema.shape.type.optional(),
  entityId: activitySchema.shape.entityId,
});
