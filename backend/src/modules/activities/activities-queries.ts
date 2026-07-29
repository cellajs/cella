import { and, count, type SQL } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import { resolveListTotal } from '#/db/utils/list-total';
import { activitiesTable } from '#/modules/activities/activities-db';
import { getOrderColumns } from '#/utils/order-column';
import { pick } from '#/utils/pick';

interface FindActivitiesPaginatedOpts {
  filters: SQL[];
  sort?: 'type' | 'createdAt' | 'tableName';
  order?: 'asc' | 'desc';
  limit: number;
  offset: number;
}

/** Find a paginated activity list and its exact total. */
export const findActivitiesPaginated = (
  ctx: DbContext,
  { filters, sort, order, limit, offset }: FindActivitiesPaginatedOpts,
) => {
  const { db } = ctx.var;
  const whereClause = and(...filters);
  const orderBy = getOrderColumns({
    sort,
    order,
    fallback: ['createdAt', 'desc'],
    columns: pick(activitiesTable, ['createdAt', 'type', 'tableName']),
    tieBreaker: activitiesTable.id,
  });

  const itemsQuery = db
    .select()
    .from(activitiesTable)
    .where(whereClause)
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset);

  return resolveListTotal(itemsQuery, {
    kind: 'exact',
    getTotal: async () => {
      const [{ total }] = await db.select({ total: count() }).from(activitiesTable).where(whereClause);
      return total;
    },
  });
};
