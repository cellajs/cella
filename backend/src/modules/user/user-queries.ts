import { and, count, eq, type SQL } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import { systemRolesTable } from '#/modules/system/system-roles-db';
import { memberSelect } from '#/modules/user/helpers/select';
import { usersTable } from '#/modules/user/user-db';

interface BuildUsersListOpts {
  filters: SQL[];
}

/** Build the users list query with role join. Returns a query that can be ordered/paginated. */
export const buildUsersListQuery = (ctx: DbContext, { filters }: BuildUsersListOpts) => {
  const { db } = ctx.var;
  const usersQuerySelect = { ...memberSelect, role: systemRolesTable.role };
  return db
    .select(usersQuerySelect)
    .from(usersTable)
    .leftJoin(systemRolesTable, eq(usersTable.id, systemRolesTable.userId))
    .where(and(...filters));
};

/** Count total users matching the list query. */
export const countUsersList = async (ctx: DbContext, { filters }: BuildUsersListOpts) => {
  const { db } = ctx.var;
  const usersQuery = buildUsersListQuery(ctx, { filters });
  const [{ total }] = await db.select({ total: count() }).from(usersQuery.as('users'));
  return total;
};

interface FindUserOpts {
  filters: SQL[];
}

/** Find a single user by filters (ID or slug) with memberSelect. */
export const findUser = async (ctx: DbContext, { filters }: FindUserOpts) => {
  const { db } = ctx.var;
  const [user] = await db
    .select(memberSelect)
    .from(usersTable)
    .where(and(...filters))
    .limit(1);
  return user;
};
