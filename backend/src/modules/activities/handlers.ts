import { OpenAPIHono } from '@hono/zod-openapi';
import { and, count, eq, ilike } from 'drizzle-orm';
import { db } from '#/db/db';
import { activitiesTable } from '#/db/schema/activities';
import type { Env } from '#/lib/context';
import activityRoutes from '#/modules/activities/routes';
import { defaultHook } from '#/utils/default-hook';
import { getOrderColumn } from '#/utils/order-column';
import { prepareStringForILikeFilter } from '#/utils/sql';

const app = new OpenAPIHono<Env>({ defaultHook });

const activityRouteHandlers = app
  /**
   * Get list of activities
   */
  .openapi(activityRoutes.getActivities, async (ctx) => {
    const { q, sort, order, offset, limit, userId, entityType, resourceType, action, tableName, type, entityId } =
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
      // Filter by entityId if provided
      ...(entityId ? [eq(activitiesTable.entityId, entityId)] : []),
      // Filter by search query if provided (searches type and tableName)
      ...(q ? [ilike(activitiesTable.type, prepareStringForILikeFilter(q))] : []),
    ];

    const orderColumn = getOrderColumn(
      {
        createdAt: activitiesTable.createdAt,
        type: activitiesTable.type,
        tableName: activitiesTable.tableName,
      },
      sort,
      activitiesTable.createdAt,
      order,
    );

    const activitiesQuery = db
      .select()
      .from(activitiesTable)
      .where(and(...filters))
      .orderBy(orderColumn);

    // Total count
    const [{ total }] = await db.select({ total: count() }).from(activitiesQuery.as('activities'));

    const activities = await activitiesQuery.limit(limit).offset(offset);

    return ctx.json({ items: activities, total }, 200);
  });

export default activityRouteHandlers;
