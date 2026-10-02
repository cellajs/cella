import { and, count, eq, type SQL, sql } from 'drizzle-orm';
import { generateId } from 'shared/utils/entity-id';
import type { DbContext } from '#/core/context';
import { resolveListTotal } from '#/db/utils/list-total';
import { deleteDanglingActors, insertActors } from '#/modules/actors/actors-queries';
import { systemRolesTable } from '#/modules/system/system-roles-db';
import { emailsTable } from '#/modules/user/emails-db';
import { memberSelect, userSelect } from '#/modules/user/helpers/select';
import { userCountersTable } from '#/modules/user/user-counters-db';
import { type InsertUserModel, type UserModel, usersTable } from '#/modules/user/user-db';
import { getOrderColumns } from '#/utils/order-column';

interface FindUsersPaginatedOpts {
  filters: SQL[];
  sort?: 'id' | 'name' | 'email' | 'createdAt' | 'lastSeenAt' | 'role';
  order?: 'asc' | 'desc';
  limit: number;
  offset: number;
}

export const findUsersPaginated = async (ctx: DbContext, opts: FindUsersPaginatedOpts) => {
  const { db } = ctx.var;
  const { filters, sort, order, limit, offset } = opts;
  const usersQuerySelect = { ...memberSelect, role: systemRolesTable.role };
  const baseQuery = db
    .select(usersQuerySelect)
    .from(usersTable)
    .leftJoin(systemRolesTable, eq(usersTable.id, systemRolesTable.userId))
    .where(and(...filters));

  const orderBy = getOrderColumns({
    sort,
    order,
    fallback: ['createdAt', 'desc'],
    columns: {
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      createdAt: usersTable.createdAt,
      // COALESCE so never-signed-in users sort as oldest: plain DESC is NULLS FIRST in Postgres
      lastSeenAt: sql`COALESCE((SELECT ${userCountersTable.lastSeenAt} FROM ${userCountersTable} WHERE ${userCountersTable.userId} = ${usersTable.id}), '-infinity')`,
      role: systemRolesTable.role,
    },
    tieBreaker: usersTable.id,
  });

  const itemsQuery = baseQuery
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset);

  return resolveListTotal(itemsQuery, {
    kind: 'exact',
    getTotal: async () => {
      const [{ total }] = await db.select({ total: count() }).from(baseQuery.as('users'));
      return total;
    },
  });
};

interface FindUserByEmailOpts {
  email: string;
}

/** Resolves through emailsTable, the owner of address uniqueness; every row there is a proven inbox. */
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

interface FindUserByIdOpts {
  id: string;
}

export const findUserById = async (ctx: DbContext, { id }: FindUserByIdOpts) => {
  const { db } = ctx.var;
  const [user] = await db.select(userSelect).from(usersTable).where(eq(usersTable.id, id)).limit(1);
  return user;
};

interface FindUserByFiltersOpts {
  filters: SQL[];
}

export const findUserByFilters = async (ctx: DbContext, { filters }: FindUserByFiltersOpts) => {
  const { db } = ctx.var;
  const [user] = await db
    .select(memberSelect)
    .from(usersTable)
    .where(and(...filters))
    .limit(1);
  return user;
};

interface FindUserForUpdateOpts {
  id: string;
}

/** Locks the user's row for the rest of the transaction; returns the MFA switch the factor rules read under that lock. */
export const findUserForUpdate = async (ctx: DbContext, { id }: FindUserForUpdateOpts) => {
  const [user] = await ctx.var.db
    .select({ id: usersTable.id, mfaRequired: usersTable.mfaRequired })
    .from(usersTable)
    .where(eq(usersTable.id, id))
    .for('update');
  return user;
};

interface FindLastSignInAtOpts {
  userId: string;
}

/** The user's counters row with the time of their last sign-in; undefined for a user who never signed in. */
export const findLastSignInAt = async (ctx: DbContext, { userId }: FindLastSignInAtOpts) => {
  const [counters] = await ctx.var.db
    .select({ lastSignInAt: userCountersTable.lastSignInAt })
    .from(userCountersTable)
    .where(eq(userCountersTable.userId, userId));
  return counters;
};

interface UpsertLastSignInAtOpts {
  userId: string;
  lastSignInAt: string;
}

/** lastSignInAt lives in user_counters to avoid CDC noise on the users table. */
export const upsertLastSignInAt = async (ctx: DbContext, { userId, lastSignInAt }: UpsertLastSignInAtOpts) => {
  await ctx.var.db
    .insert(userCountersTable)
    .values({ userId, lastSignInAt })
    .onConflictDoUpdate({ target: userCountersTable.userId, set: { lastSignInAt } });
};

interface InsertUsersOpts {
  users: InsertUserModel[];
  /** Skip rows that already exist (seed re-runs); a skipped user leaves no actor behind. */
  onConflictDoNothing?: boolean;
}

/**
 * The only way to insert users: the `actors` row of kind `user` goes first, in one transaction, so a failed user
 * insert (taken email, slug race) leaves no orphan actor and a missed call site fails on the foreign key.
 */
export const insertUsers = async (ctx: DbContext, { users, onConflictDoNothing = false }: InsertUsersOpts): Promise<UserModel[]> => {
  if (users.length === 0) return [];
  const withIds = users.map((user) => ({ ...user, id: user.id ?? generateId() }));

  return ctx.var.db.transaction(async (tx) => {
    const txCtx = { var: { db: tx } };
    const ids = withIds.map(({ id }) => id);
    const actorIds = await insertActors(txCtx, { ids, kind: 'user', onConflictDoNothing });
    const userInsert = tx.insert(usersTable).values(withIds).returning();
    const inserted = onConflictDoNothing ? await userInsert.onConflictDoNothing() : await userInsert;

    // Only actors this call created and whose user row was skipped; an id that already existed keeps its user.
    if (onConflictDoNothing && inserted.length < withIds.length) {
      const insertedIds = new Set(inserted.map((user) => user.id));
      await deleteDanglingActors(txCtx, { ids: actorIds.filter((id) => !insertedIds.has(id)) });
    }
    return inserted;
  });
};
