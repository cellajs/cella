import { z } from '@hono/zod-openapi';
import { activityActions, appConfig, trackedEventTypes } from 'shared';
import { createSelectSchema } from '#/db/utils/drizzle-schema';
import { activitiesTable } from '#/modules/activities/activities-db';
import { entityTypeSchema } from '#/schemas';
import { nullableStxBaseSchema } from '#/schemas/sync-transaction-schemas';

export const activityActionSchema = z.enum(activityActions);

const resourceTypeSchema = z.enum(appConfig.resourceTypes);

const activityEventTypeSchema = z.enum(trackedEventTypes);

/** An activity row as the CDC worker sends it to the API. */
export const activitySchema = z.object({
  ...createSelectSchema(activitiesTable).shape,
  // Explicit enum and jsonb schemas type the worker's message parse.
  entityType: entityTypeSchema.nullable(),
  resourceType: resourceTypeSchema.nullable(),
  action: activityActionSchema,
  type: activityEventTypeSchema,
  changedFields: z.array(z.string()).nullable(),
  stx: nullableStxBaseSchema,
});
