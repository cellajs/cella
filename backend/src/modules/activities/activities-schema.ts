import { z } from '@hono/zod-openapi';
import { appConfig } from 'config';
import { createSelectSchema } from 'drizzle-zod';
import { activitiesTable } from '#/db/schema/activities';
import { activityActions } from '#/lib/event-bus';
import { resourceTypes } from '#/table-config';
import { paginationQuerySchema } from '#/utils/schema/common';
import { mockActivityResponse } from '../../../mocks/mock-activity';

/** Schema for activity actions enum */
export const activityActionSchema = z.enum(activityActions);

/** Schema for resource types enum */
export const resourceTypeSchema = z.enum(resourceTypes);

/** Full activity schema derived from table */
export const activitySchema = z
  .object(createSelectSchema(activitiesTable).shape)
  .openapi('Activity', { example: mockActivityResponse() });

/** Query schema for filtering and paginating activities */
export const activityListQuerySchema = paginationQuerySchema.extend({
  sort: z.enum(['createdAt', 'type', 'tableName']).default('createdAt').optional(),
  userId: z.string().optional(),
  entityType: z.enum(appConfig.entityTypes).optional(),
  resourceType: resourceTypeSchema.optional(),
  action: activityActionSchema.optional(),
  tableName: z.string().optional(),
  type: z.string().optional(),
  entityId: z.string().optional(),
});
