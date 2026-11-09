import type { z } from '@hono/zod-openapi';
import { and, count, eq, exists, inArray, type SQL, sql } from 'drizzle-orm';
import type { UserFlags } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import type { DbContext } from '#/core/context';
import { exactTotal, resolveListTotal } from '#/db/utils/list-total';
import { updateStamps } from '#/db/utils/stamps';
import { actorsTable } from '#/modules/actors/actors-db';
import { deleteDanglingActors, insertActors } from '#/modules/actors/actors-queries';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { type SystemRoleModel, systemRolesTable } from '#/modules/system/system-roles-db';
import { type EmailProof, emailsTable } from '#/modules/user/emails-db';
import { lastSeenOrder, memberSelect, userActorJoin, userSelect } from '#/modules/user/helpers/select';
import { type InsertUserModel, type UserModel, usersTable } from '#/modules/user/user-db';
import type { userListQuerySchema } from '#/modules/user/user-schema';
import { getIsoDate } from '#/utils/iso-date';
import type { MergePatch } from '#/utils/merge-patch';
import { getOrderColumns } from '#/utils/order-column';
import { searchFilter } from '#/utils/sql';

/** EXISTS filter limiting user rows to members of one of `organizationIds`: defense in depth mirroring relatableGuard. */
const sharesOrgFilter = (ctx: DbContext, organizationIds: string[]) =>
  exists(
    ctx.var.db
      .select({ id: membershipsTable.id })
      .from(membershipsTable)
      .where(and(eq(membershipsTable.userId, usersTable.id), inArray(membershipsTable.organizationId, organizationIds))),
  );

/** `EXISTS` on a proven address of the user row: what sets a real account apart from a provisional one (a demo's, a sample's). */
export const hasProvenEmail = (userId: typeof usersTable.id): SQL =>
  sql`EXISTS (SELECT 1 FROM ${emailsTable} WHERE ${emailsTable.userId} = ${userId})`;

/** Whether the account holds a proven address; false for a provisional one, which binds nothing lasting to itself. */
export const isProvenAccount = async (ctx: DbContext, { userId }: { userId: string }) => {
  const [row] = await ctx.var.db
    .select({ proven: hasProvenEmail(usersTable.id) })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  return row?.proven === true;
};

interface FindUsersPaginatedOpts extends Pick<z.infer<typeof userListQuerySchema>['orderBy'], 'sort' | 'order'> {
  /** Searches name and email. */
  q?: string;
  role?: SystemRoleModel['role'];
  /** Limits the list to members of one of these organizations; unset lists every user. */
  memberOfAny?: string[];
  /** Leaves out the accounts without a proven address. */
  provenOnly?: boolean;
  limit: number;
  offset: number;
}

/** A page of users as members see them, each with its system role (null without one), and the total. */
export const findUsersPaginated = async (ctx: DbContext, opts: FindUsersPaginatedOpts) => {
  const { db } = ctx.var;
  const { q, role, memberOfAny, provenOnly = false, sort, order, limit, offset } = opts;

  const filters: SQL[] = [];
  if (memberOfAny) filters.push(sharesOrgFilter(ctx, memberOfAny));
  if (provenOnly) filters.push(hasProvenEmail(usersTable.id));
  if (role) filters.push(eq(systemRolesTable.role, role));
  const search = searchFilter([usersTable.name, usersTable.email], q);
  if (search) filters.push(search);

  const where = and(...filters);
  const systemRoleJoin = eq(usersTable.id, systemRolesTable.userId);

  const orderBy = getOrderColumns({
    sort,
    order,
    columns: {
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      createdAt: usersTable.createdAt,
      lastSeenAt: lastSeenOrder,
      role: systemRolesTable.role,
    },
    tieBreaker: usersTable.id,
  });

  const itemsQuery = db
    .select({ ...memberSelect, role: systemRolesTable.role })
    .from(usersTable)
    .innerJoin(actorsTable, userActorJoin)
    .leftJoin(systemRolesTable, systemRoleJoin)
    .where(where)
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset);

  const totalQuery = db
    .select({ total: count() })
    .from(usersTable)
    .innerJoin(actorsTable, userActorJoin)
    .leftJoin(systemRolesTable, systemRoleJoin)
    .where(where);
  return resolveListTotal(itemsQuery, exactTotal(totalQuery));
};

/** Resolves through emailsTable, the owner of address uniqueness; every row there is a proven inbox. */
export const findUserByEmail = async (ctx: DbContext, { email }: { email: string }) => {
  const [user] = await ctx.var.db
    .select(userSelect)
    .from(usersTable)
    .innerJoin(actorsTable, userActorJoin)
    .innerJoin(emailsTable, eq(usersTable.id, emailsTable.userId))
    .where(eq(emailsTable.email, email))
    .limit(1);
  return user;
};

/** The user with the activity times of its `actors` row; undefined when no user has `id`. */
export const findUserById = async (ctx: DbContext, { id }: { id: string }) => {
  const [user] = await ctx.var.db.select(userSelect).from(usersTable).innerJoin(actorsTable, userActorJoin).where(eq(usersTable.id, id)).limit(1);
  return user;
};

interface FindMemberUserOpts {
  /** An id, or a slug when `bySlug`. */
  identifier: string;
  bySlug?: boolean;
  /** Limits the read to a member of one of these organizations. */
  memberOfAny?: string[];
}

/** A user as members see them; undefined when none matches, which includes a user outside `memberOfAny`. */
export const findMemberUser = async (ctx: DbContext, { identifier, bySlug = false, memberOfAny }: FindMemberUserOpts) => {
  const filters: SQL[] = [bySlug ? eq(usersTable.slug, identifier) : eq(usersTable.id, identifier)];
  if (memberOfAny) filters.push(sharesOrgFilter(ctx, memberOfAny));
  const [user] = await ctx.var.db
    .select(memberSelect)
    .from(usersTable)
    .innerJoin(actorsTable, userActorJoin)
    .where(and(...filters))
    .limit(1);
  return user;
};

/** Locks the user's row for the rest of the transaction; returns the MFA switch the factor rules read under that lock. */
export const findUserForUpdate = async (ctx: DbContext, { id }: { id: string }) => {
  const [user] = await ctx.var.db
    .select({ id: usersTable.id, mfaRequired: usersTable.mfaRequired })
    .from(usersTable)
    .where(eq(usersTable.id, id))
    .for('update');
  return user;
};

/** The time of the user's last sign-in, null for a user who never signed in; undefined when no actor row exists. */
export const findLastSignInAt = async (ctx: DbContext, { userId }: { userId: string }) => {
  const [actor] = await ctx.var.db.select({ lastSignInAt: actorsTable.lastSignInAt }).from(actorsTable).where(eq(actorsTable.id, userId));
  return actor?.lastSignInAt;
};

/** Stamps the sign-in on the user's `actors` row, outside the CDC publication that carries `users`. */
export const updateLastSignInAt = async (ctx: DbContext, { userId, lastSignInAt }: { userId: string; lastSignInAt: string }) => {
  await ctx.var.db.update(actorsTable).set({ lastSignInAt }).where(eq(actorsTable.id, userId));
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

/** The email row of an address, whichever account holds it; undefined when none does. */
export const findEmail = async (ctx: DbContext, { email }: { email: string }) => {
  const [row] = await ctx.var.db.select().from(emailsTable).where(eq(emailsTable.email, email)).limit(1);
  return row;
};

export interface EmailProofOpts {
  userId: string;
  email: string;
  via: EmailProof;
}

/** The row a first proof of an address writes: verified now, `via` the proof. */
const provenEmailRow = ({ userId, email, via }: EmailProofOpts, now: string) => ({
  email,
  userId,
  verifiedAt: now,
  lastVerifiedVia: via,
  lastVerifiedAt: now,
});

/** The columns a later proof writes: the stamps every time, `verifiedAt` only when it was never set. */
const proofStamps = (via: EmailProof, now: string) => ({
  verifiedAt: sql<string>`coalesce(${emailsTable.verifiedAt}, ${now})`,
  lastVerifiedVia: via,
  lastVerifiedAt: now,
});

/** Stores an address as proven now, `via` the proof. Fails on the unique address when any account holds it. */
export const insertEmail = async (ctx: DbContext, opts: EmailProofOpts) => {
  await ctx.var.db.insert(emailsTable).values(provenEmailRow(opts, getIsoDate()));
};

/** Stamps a proof on the user's own row for the address; undefined when the user has no row for it. */
export const updateEmailProof = async (ctx: DbContext, { userId, email, via }: EmailProofOpts) => {
  const [stamped] = await ctx.var.db
    .update(emailsTable)
    .set(proofStamps(via, getIsoDate()))
    .where(and(eq(emailsTable.email, email), eq(emailsTable.userId, userId)))
    .returning({ id: emailsTable.id });
  return stamped;
};

/**
 * Stores a proven address for the user, or stamps the proof when the row is already theirs, in one statement: insert, or
 * on a taken address update only when this user holds it. Undefined when another account holds the address.
 */
export const upsertProvenEmail = async (ctx: DbContext, opts: EmailProofOpts) => {
  const now = getIsoDate();
  const [row] = await ctx.var.db
    .insert(emailsTable)
    .values(provenEmailRow(opts, now))
    .onConflictDoUpdate({ target: emailsTable.email, set: proofStamps(opts.via, now), setWhere: eq(emailsTable.userId, opts.userId) })
    .returning({ id: emailsTable.id });
  return row;
};

interface FindMfaRequiredOpts {
  userId: string;
  /** Limits the read to a user who is a member of one of these organizations. */
  memberOfAny?: string[];
}

/** A user's MFA switch; undefined when no user matches, which includes a user outside `memberOfAny`. */
export const findMfaRequired = async (ctx: DbContext, { userId, memberOfAny }: FindMfaRequiredOpts) => {
  const filters: SQL[] = [eq(usersTable.id, userId)];
  if (memberOfAny) filters.push(sharesOrgFilter(ctx, memberOfAny));
  const [user] = await ctx.var.db
    .select({ mfaRequired: usersTable.mfaRequired })
    .from(usersTable)
    .where(and(...filters))
    .limit(1);
  return user?.mfaRequired;
};

interface UserIdsOpts {
  ids: string[];
}

/** Full user rows by id. */
export const findUserModelsByIds = async (ctx: DbContext, { ids }: UserIdsOpts) =>
  ctx.var.db.select().from(usersTable).where(inArray(usersTable.id, ids));

/** The ids among `ids` that name a user. */
export const findExistingUserIds = async (ctx: DbContext, { ids }: UserIdsOpts) =>
  ctx.var.db.select({ id: usersTable.id }).from(usersTable).where(inArray(usersTable.id, ids));

/**
 * The ids among `ids` of provisional accounts nothing holds any more: no proven address and no membership left. A
 * removed tenant's demo account is one; a member who signed up stays, and so does one who belongs elsewhere.
 */
export const findOrphanedProvisionalUserIds = async (ctx: DbContext, { ids }: UserIdsOpts): Promise<string[]> => {
  if (ids.length === 0) return [];
  const rows = await ctx.var.db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(
      and(
        inArray(usersTable.id, ids),
        sql`NOT ${hasProvenEmail(usersTable.id)}`,
        sql`NOT EXISTS (SELECT 1 FROM ${membershipsTable} WHERE ${membershipsTable.userId} = ${usersTable.id})`,
      ),
    );
  return rows.map(({ id }) => id);
};

/** Deletes the user rows; `deleteAccounts` clears what else an account holds. */
export const deleteUsersByIds = async (ctx: DbContext, { ids }: UserIdsOpts) => {
  return ctx.var.db.delete(usersTable).where(inArray(usersTable.id, ids));
};

interface UpdateUserOpts {
  id: string;
  values: Partial<Omit<InsertUserModel, 'userFlags'>> & { userFlags?: MergePatch<UserFlags> };
}

/**
 * Writes `values` to one user: an undefined value leaves its column, and `userFlags` is a merge patch (RFC 7396) of
 * the stored flags. Flags are flat booleans, so `||` with the nulls stripped is that merge, in one statement.
 * @returns The updated row, undefined when no user has `id`.
 */
export const updateUser = async (ctx: DbContext, { id, values }: UpdateUserOpts) => {
  const { userFlags, ...rest } = values;
  const [updated] = await ctx.var.db
    .update(usersTable)
    .set({ ...rest, ...(userFlags && { userFlags: sql`jsonb_strip_nulls(${usersTable.userFlags} || ${JSON.stringify(userFlags)}::jsonb)` }) })
    .where(eq(usersTable.id, id))
    .returning();
  return updated;
};

/** Sets the user's MFA switch as their own write; the caller ends the sessions that turning it on replaces. */
export const updateUserMfa = async (ctx: DbContext, { id, mfaRequired }: { id: string; mfaRequired: boolean }) =>
  updateUser(ctx, { id, values: { mfaRequired, ...updateStamps(id) } });
