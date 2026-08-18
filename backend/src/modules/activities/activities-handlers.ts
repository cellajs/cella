import { OpenAPIHono } from '@hono/zod-openapi';
import { eq, ilike } from 'drizzle-orm';
import type { Env } from '#/core/context';
import { activitiesTable } from '#/modules/activities/activities-db';
import { findActivitiesPaginated } from '#/modules/activities/activities-queries';
import { activityRoutes } from '#/modules/activities/activities-routes';
import { defaultHook } from '#/utils/default-hook';
import { prepareStringForILikeFilter } from '#/utils/sql';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(activityRoutes.getActivities, async (ctx) => {
  const { q, sort, order, offset, limit, userId, entityType, resourceType, action, tableName, type, subjectId } =
    ctx.req.valid('query');

  const filters = [
    ...(userId ? [eq(activitiesTable.userId, userId)] : []),
    ...(entityType ? [eq(activitiesTable.entityType, entityType)] : []),
    ...(resourceType ? [eq(activitiesTable.resourceType, resourceType)] : []),
    ...(action ? [eq(activitiesTable.action, action)] : []),
    ...(tableName ? [eq(activitiesTable.tableName, tableName)] : []),
    ...(type ? [eq(activitiesTable.type, type)] : []),
    ...(subjectId ? [eq(activitiesTable.subjectId, subjectId)] : []),
    ...(q ? [ilike(activitiesTable.type, prepareStringForILikeFilter(q))] : []),
  ];

  const result = await findActivitiesPaginated(ctx, { filters, sort, order, limit, offset });
  return ctx.json(result, 200);
});

export const activityHandlers = app;
