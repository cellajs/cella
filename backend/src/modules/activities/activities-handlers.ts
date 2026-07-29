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
    // Filter by userId if provided
    ...(userId ? [eq(activitiesTable.userId, userId)] : []),
    // Filter by entityType if provided
    ...(entityType ? [eq(activitiesTable.entityType, entityType)] : []),
    // Filter by resourceType if provided
    ...(resourceType ? [eq(activitiesTable.resourceType, resourceType)] : []),
    // Filter by action if provided
    ...(action ? [eq(activitiesTable.action, action)] : []),
    // Filter by tableName if provided
    ...(tableName ? [eq(activitiesTable.tableName, tableName)] : []),
    // Filter by type if provided
    ...(type ? [eq(activitiesTable.type, type)] : []),
    // Filter by subjectId if provided
    ...(subjectId ? [eq(activitiesTable.subjectId, subjectId)] : []),
    // Filter by search query if provided (searches type and tableName)
    ...(q ? [ilike(activitiesTable.type, prepareStringForILikeFilter(q))] : []),
  ];

  const result = await findActivitiesPaginated(ctx, { filters, sort, order, limit, offset });
  return ctx.json(result, 200);
});

export const activityHandlers = app;
