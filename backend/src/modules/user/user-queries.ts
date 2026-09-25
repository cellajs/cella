import { and, count, eq, isNotNull, lt, notExists, type SQL, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { DbContext } from '#/core/context';
import { resolveListTotal } from '#/db/utils/list-total';
import { identitiesTable } from '#/modules/auth/identities-db';
import { sessionsTable } from '#/modules/auth/sessions-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { systemRolesTable } from '#/modules/system/system-roles-db';
import { emailsTable } from '#/modules/user/emails-db';
import { memberSelect, userSelect } from '#/modules/user/helpers/select';
import { userCountersTable } from '#/modules/user/user-counters-db';
import { usersTable } from '#/modules/user/user-db';
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
  /** Only a holder who has proven the inbox. An unverified row is a claim anyone could have typed. */
  verifiedOnly?: boolean;
}

/** Resolves through emailsTable, the owner of address uniqueness and verification state. */
export const findUserByEmail = async (ctx: DbContext, { email, verifiedOnly = false }: FindUserByEmailOpts) => {
  const { db } = ctx.var;
  const [user] = await db
    .select(userSelect)
    .from(usersTable)
    .leftJoin(emailsTable, eq(usersTable.id, emailsTable.userId))
    .where(and(eq(emailsTable.email, email), verifiedOnly ? eq(emailsTable.verified, true) : undefined))
    .limit(1);
  return user;
};

interface FindUnprovenUserIdsOpts {
  createdBefore: string;
  limit: number;
}

/**
 * Accounts nobody ever proved or used: no verified address, no verified identity, never signed in, no session, no
 * membership, no system role. They come from an invitation's OAuth sign-up whose verification mail was never clicked,
 * and hold their address hostage.
 */
export const findUnprovenUserIds = async (ctx: DbContext, { createdBefore, limit }: FindUnprovenUserIdsOpts) => {
  const { db } = ctx.var;
  const ownedBy = (userIdColumn: AnyPgColumn) => eq(userIdColumn, usersTable.id);

  const rows = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(
      and(
        lt(usersTable.createdAt, createdBefore),
        notExists(
          db
            .select({ one: sql`1` })
            .from(emailsTable)
            .where(and(ownedBy(emailsTable.userId), eq(emailsTable.verified, true))),
        ),
        notExists(
          db
            .select({ one: sql`1` })
            .from(identitiesTable)
            .where(and(ownedBy(identitiesTable.userId), eq(identitiesTable.verified, true))),
        ),
        notExists(
          db
            .select({ one: sql`1` })
            .from(userCountersTable)
            .where(and(ownedBy(userCountersTable.userId), isNotNull(userCountersTable.lastSignInAt))),
        ),
        notExists(db.select({ one: sql`1` }).from(sessionsTable).where(ownedBy(sessionsTable.userId))),
        notExists(db.select({ one: sql`1` }).from(membershipsTable).where(ownedBy(membershipsTable.userId))),
        notExists(db.select({ one: sql`1` }).from(systemRolesTable).where(ownedBy(systemRolesTable.userId))),
      ),
    )
    .limit(limit);
  return rows.map((row) => row.id);
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
