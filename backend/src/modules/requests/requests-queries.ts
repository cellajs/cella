import { and, count, eq, getColumns, inArray, type SQL, sql } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import { resolveListTotal } from '#/db/utils/list-total';
import { type RequestModel, requestsTable } from '#/modules/requests/requests-db';
import { getOrderColumns } from '#/utils/order-column';
import { pick } from '#/utils/pick';

interface FindExistingRequestOpts {
  email: string;
  type: RequestModel['type'];
}

/** Check for an existing unique request by normalized email and type. */
export const findExistingRequest = async (ctx: DbContext, { email, type }: FindExistingRequestOpts) => {
  const { db } = ctx.var;
  const [existing] = await db
    .select()
    .from(requestsTable)
    .where(and(eq(requestsTable.email, email), eq(requestsTable.type, type)))
    .limit(1);
  return existing;
};

interface InsertRequestOpts {
  email: string;
  type: RequestModel['type'];
  message?: string | null;
}

/**
 * Insert a request and return the created row (without tokenId).
 * Returns undefined when the unique signup index (waitlist/newsletter per lower(email))
 * rejects the row, so concurrent or case-variant duplicates surface as a duplicate
 * signal instead of a raw constraint violation.
 */
export const insertRequest = async (ctx: DbContext, { email, type, message }: InsertRequestOpts) => {
  const { db } = ctx.var;
  const { tokenId, ...requestsSelect } = getColumns(requestsTable);
  const [created] = await db
    .insert(requestsTable)
    .values({ email, type, message })
    .onConflictDoNothing()
    .returning({ ...requestsSelect });
  return created;
};

interface FindRequestsPaginatedOpts {
  filter?: SQL;
  sort?: 'type' | 'id' | 'createdAt' | 'email';
  order?: 'asc' | 'desc';
  limit: number;
  offset: number;
}

/** Get paginated requests list with total count. */
export const findRequestsPaginated = async (ctx: DbContext, opts: FindRequestsPaginatedOpts) => {
  const { db } = ctx.var;
  const { filter, sort, order, limit, offset } = opts;
  const { tokenId, ...requestsSelect } = getColumns(requestsTable);

  const orderBy = getOrderColumns({
    sort,
    order,
    fallback: ['createdAt', 'desc'],
    columns: pick(requestsTable, ['id', 'email', 'createdAt', 'type']),
    tieBreaker: requestsTable.id,
  });

  const itemsQuery = db
    .select({
      ...requestsSelect,
      wasInvited: sql<boolean>`(${requestsTable.tokenId} IS NOT NULL)::boolean`.as('wasInvited'),
    })
    .from(requestsTable)
    .where(filter)
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset);

  return resolveListTotal(itemsQuery, {
    kind: 'exact',
    getTotal: async () => {
      const [{ total }] = await db.select({ total: count() }).from(requestsTable).where(filter);
      return total;
    },
  });
};

interface DeleteRequestsByIdsOpts {
  ids: string[];
}

/** Delete requests by IDs. */
export const deleteRequestsByIds = async (ctx: DbContext, { ids }: DeleteRequestsByIdsOpts) => {
  const { db } = ctx.var;
  return db.delete(requestsTable).where(inArray(requestsTable.id, ids));
};

interface LinkWaitlistRequestOpts {
  email: string;
  tokenId: string;
}

/** Link a waitlist request to a token (from activity bus). */
export const linkWaitlistRequest = async (ctx: DbContext, { email, tokenId }: LinkWaitlistRequestOpts) => {
  const { db } = ctx.var;
  return db
    .update(requestsTable)
    .set({ tokenId })
    .where(and(eq(requestsTable.email, email), eq(requestsTable.type, 'waitlist')));
};
