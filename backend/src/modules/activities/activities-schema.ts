import { z } from '@hono/zod-openapi';
import { activityActions, appConfig, trackedEventTypes } from 'shared';
import { schemaTags } from '#/core/openapi-helpers';
import { createSelectSchema } from '#/db/utils/drizzle-schema';
import { activitiesTable } from '#/modules/activities/activities-db';
import { entityTypeSchema } from '#/schemas';
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
    'x-tags': schemaTags('data', 'activities', 'cella'),
  });
