import type { z } from '@hono/zod-openapi';
import { and, count, eq, getColumns, inArray, isNull, sql } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import { exactTotal, resolveListTotal } from '#/db/utils/list-total';
import { type RequestModel, requestsTable } from '#/modules/requests/requests-db';
import type { requestListQuerySchema } from '#/modules/requests/requests-schema';
import { getIsoDate } from '#/utils/iso-date';
import { getOrderColumns } from '#/utils/order-column';
import { pick } from '#/utils/pick';
import { searchFilter } from '#/utils/sql';

/** A request's columns as responses carry them: `invitedAt` travels as `wasInvited`. */
const { invitedAt, ...requestColumns } = getColumns(requestsTable);

const requestOrderColumns = pick(requestsTable, ['id', 'email', 'createdAt', 'kind']);

interface InsertRequestOpts {
  email: string;
  kind: RequestModel['kind'];
  message?: string | null;
}

/** Returns undefined when the unique signup index (lower(email) for waitlist/newsletter) rejects the row as a duplicate. */
export const insertRequest = async (ctx: DbContext, { email, kind, message }: InsertRequestOpts) => {
  const [created] = await ctx.var.db.insert(requestsTable).values({ email, kind, message }).onConflictDoNothing().returning(requestColumns);
  return created;
};

interface FindRequestsPaginatedOpts extends Pick<z.infer<typeof requestListQuerySchema>['orderBy'], 'sort' | 'order'> {
  /** Searches the address. */
  q?: string;
  limit: number;
  offset: number;
}

/** A page of requests with `wasInvited`, and the total. */
export const findRequestsPaginated = async (ctx: DbContext, { q, sort, order, limit, offset }: FindRequestsPaginatedOpts) => {
  const { db } = ctx.var;

  const filter = searchFilter([requestsTable.email], q);

  const orderBy = getOrderColumns({ sort, order, columns: requestOrderColumns, tieBreaker: requestsTable.id });

  const itemsQuery = db
    .select({ ...requestColumns, wasInvited: sql<boolean>`${requestsTable.invitedAt} IS NOT NULL`.as('wasInvited') })
    .from(requestsTable)
    .where(filter)
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset);

  return resolveListTotal(itemsQuery, exactTotal(db.select({ total: count() }).from(requestsTable).where(filter)));
};

/** Deletes requests by id. */
export const deleteRequestsByIds = async (ctx: DbContext, { ids }: { ids: string[] }) =>
  ctx.var.db.delete(requestsTable).where(inArray(requestsTable.id, ids));

/** Stamps the address's waitlist request as invited now; a request invited before keeps its first time. */
export const stampWaitlistRequestInvited = async (ctx: DbContext, { email }: { email: string }) =>
  ctx.var.db
    .update(requestsTable)
    .set({ invitedAt: getIsoDate() })
    .where(and(eq(requestsTable.email, email), eq(requestsTable.kind, 'waitlist'), isNull(requestsTable.invitedAt)));
