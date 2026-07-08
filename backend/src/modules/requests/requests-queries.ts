import { and, count, eq, getColumns, inArray, type SQL, sql } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import { type RequestModel, requestsTable } from '#/modules/requests/requests-db';
import { emailsTable } from '#/modules/user/emails-db';
import { userSelect } from '#/modules/user/helpers/select';
import { usersTable } from '#/modules/user/user-db';
import { getOrderColumn } from '#/utils/order-column';

interface FindUserByEmailOpts {
  email: string;
}

/** Find a user by email (via emailsTable join). */
export const findUserByEmail = async (ctx: DbContext, { email }: FindUserByEmailOpts) => {
  const { db } = ctx.var;
  const [user] = await db
    .select(userSelect)
    .from(usersTable)
    .leftJoin(emailsTable, eq(usersTable.id, emailsTable.userId))
    .where(eq(emailsTable.email, email))
    .limit(1);
  return user;
};

interface FindExistingRequestOpts {
  email: string;
  types: RequestModel['type'][];
}

/** Check for existing unique requests by email and types. */
export const findExistingRequest = async (ctx: DbContext, { email, types }: FindExistingRequestOpts) => {
  const { db } = ctx.var;
  const [existing] = await db
    .select()
    .from(requestsTable)
    .where(and(eq(requestsTable.email, email), inArray(requestsTable.type, types)));
  return existing;
};

interface InsertRequestOpts {
  email: string;
  type: RequestModel['type'];
  message?: string | null;
}

/** Insert a request and return the created row (without tokenId). */
export const insertRequest = async (ctx: DbContext, { email, type, message }: InsertRequestOpts) => {
  const { db } = ctx.var;
  const { tokenId, ...requestsSelect } = getColumns(requestsTable);
  const [created] = await db
    .insert(requestsTable)
    .values({ email, type, message })
    .returning({ ...requestsSelect });
  return created;
};

interface BuildRequestsListOpts {
  filter?: SQL;
}

/** Build the requests list query with wasInvited computed column. Returns a subquery. */
export const buildRequestsListQuery = (ctx: DbContext, { filter }: BuildRequestsListOpts) => {
  const { db } = ctx.var;
  const { tokenId, ...requestsSelect } = getColumns(requestsTable);
  return db
    .select({
      ...requestsSelect,
      wasInvited: sql<boolean>`(${requestsTable.tokenId} IS NOT NULL)::boolean`.as('wasInvited'),
    })
    .from(requestsTable)
    .where(filter);
};

interface GetRequestsListOpts {
  filter?: SQL;
  sort?: 'type' | 'id' | 'createdAt' | 'email';
  order?: 'asc' | 'desc';
  limit: number;
  offset: number;
}

/** Get paginated requests list with total count. */
export const getRequestsList = async (ctx: DbContext, opts: GetRequestsListOpts) => {
  const { db } = ctx.var;
  const { filter, sort, order, limit, offset } = opts;
  const requestsQuery = buildRequestsListQuery(ctx, { filter });

  const [{ total }] = await db.select({ total: count() }).from(requestsQuery.as('requests'));

  const orderColumn = getOrderColumn(sort, requestsTable.id, order, {
    id: requestsTable.id,
    email: requestsTable.email,
    createdAt: requestsTable.createdAt,
    type: requestsTable.type,
  });

  const items = await db.select().from(requestsQuery.as('requests')).orderBy(orderColumn).limit(limit).offset(offset);

  return { items, total };
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
