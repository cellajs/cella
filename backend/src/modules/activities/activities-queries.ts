import { and, count, type SQL } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import { activitiesTable } from '#/db/schema/activities';
import { getOrderColumn } from '#/utils/order-column';

interface BuildActivitiesListOpts {
  filters: SQL[];
  sort?: 'type' | 'createdAt' | 'tableName';
  order?: 'asc' | 'desc';
}

/** Build the activities list query with filters and ordering. Returns a subquery. */
export const buildActivitiesListQuery = (ctx: DbContext, { filters, sort, order }: BuildActivitiesListOpts) => {
  const { db } = ctx.var;
  const orderColumn = getOrderColumn(sort, activitiesTable.createdAt, order, {
    createdAt: activitiesTable.createdAt,
    type: activitiesTable.type,
    tableName: activitiesTable.tableName,
  });

  return db
    .select()
    .from(activitiesTable)
    .where(and(...filters))
    .orderBy(orderColumn);
};

/** Count total activities matching the list query. */
export const countActivitiesList = async (ctx: DbContext, { filters, sort, order }: BuildActivitiesListOpts) => {
  const { db } = ctx.var;
  const activitiesQuery = buildActivitiesListQuery(ctx, { filters, sort, order });
  const [{ total }] = await db.select({ total: count() }).from(activitiesQuery.as('activities'));
  return total;
};
