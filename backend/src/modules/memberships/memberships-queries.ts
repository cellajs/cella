import { and, count, eq, ilike, inArray, isNull, lte, or, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { ChannelEntityType, EntityRole } from 'shared';
import type { DbContext, OrgContext, UserContext } from '#/core/context';
import { resolveListTotal } from '#/db/utils/list-total';
import { lastPostedAtOrder, memberCountsSelect } from '#/modules/memberships/helpers/member-counts';
import { membershipBaseSelect } from '#/modules/memberships/helpers/select';
import { inactiveMembershipsTable } from '#/modules/memberships/inactive-memberships-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { emailsTable } from '#/modules/user/emails-db';
import type { UserMinimalBase } from '#/modules/user/helpers/audit-user';
import { memberSelect } from '#/modules/user/helpers/select';
import { userCountersTable } from '#/modules/user/user-counters-db';
import { usersTable } from '#/modules/user/user-db';
import { getOrderColumns } from '#/utils/order-column';
import { prepareStringForILikeFilter } from '#/utils/sql';

interface CountMembershipsByChannelOpts {
  channelType: ChannelEntityType;
  channelId: string;
}

export const countMembershipsByChannel = async (
  ctx: DbContext,
  { channelType, channelId }: CountMembershipsByChannelOpts,
) => {
  const { db } = ctx.var;
  const [{ currentOrgMemberships }] = await db
    .select({ currentOrgMemberships: count() })
    .from(membershipsTable)
    .where(and(eq(membershipsTable.channelType, channelType), eq(membershipsTable.channelId, channelId)));
  return currentOrgMemberships;
};

interface CountPendingInvitesByChannelOpts {
  channelType: ChannelEntityType;
  channelId: string;
}

export const countPendingInvitesByChannel = async (
  ctx: DbContext,
  { channelType, channelId }: CountPendingInvitesByChannelOpts,
) => {
  const { db } = ctx.var;
  const [{ pendingInvites }] = await db
    .select({ pendingInvites: count() })
    .from(inactiveMembershipsTable)
    .where(
      and(eq(inactiveMembershipsTable.channelType, channelType), eq(inactiveMembershipsTable.channelId, channelId)),
    );
  return pendingInvites;
};

interface FindInvitationAccountsOpts {
  emails: string[];
  entityType: ChannelEntityType;
  entityId: string;
}

/**
 * The accounts behind invited addresses, one row per address an account holds: its primary address, and whether it is
 * a member of the channel and of the organization. Addresses no account holds have no row.
 */
export const findInvitationAccounts = async (
  ctx: OrgContext,
  { emails, entityType, entityId }: FindInvitationAccountsOpts,
) => {
  const { db, organizationId } = ctx.var;
  const orgMemberships = alias(membershipsTable, 'org_memberships');

  return db
    .select({
      email: emailsTable.email,
      userId: usersTable.id,
      primaryEmail: usersTable.email,
      membershipId: membershipsTable.id,
      orgMembershipId: orgMemberships.id,
    })
    .from(emailsTable)
    .innerJoin(usersTable, eq(usersTable.id, emailsTable.userId))
    .leftJoin(
      membershipsTable,
      and(
        eq(membershipsTable.userId, usersTable.id),
        eq(membershipsTable.channelType, entityType),
        eq(membershipsTable.channelId, entityId),
      ),
    )
    .leftJoin(
      orgMemberships,
      and(
        eq(orgMemberships.userId, usersTable.id),
        eq(orgMemberships.channelType, 'organization'),
        eq(orgMemberships.channelId, organizationId),
      ),
    )
    .where(inArray(emailsTable.email, emails));
};

interface FindInvitationsToAddressesOpts {
  emails: string[];
  channelId: string;
}

/** The channel's invitations addressed to exactly these addresses, pending or rejected. */
export const findInvitationsToAddresses = async (
  ctx: DbContext,
  { emails, channelId }: FindInvitationsToAddressesOpts,
) => {
  const { db } = ctx.var;
  if (!emails.length) return [];
  return db
    .select({
      id: inactiveMembershipsTable.id,
      email: inactiveMembershipsTable.email,
      rejectedAt: inactiveMembershipsTable.rejectedAt,
      // Last dispatch timestamps for the reminder throttle (remindedAt ?? createdAt)
      createdAt: inactiveMembershipsTable.createdAt,
      remindedAt: inactiveMembershipsTable.remindedAt,
    })
    .from(inactiveMembershipsTable)
    .where(and(eq(inactiveMembershipsTable.channelId, channelId), inArray(inactiveMembershipsTable.email, emails)));
};

interface FindPendingInactiveMembershipsByChannelsOpts {
  channelIds: string[];
}

/** Pending (not rejected) inactive memberships for a set of contexts (deferred-invite dispatch). */
export const findPendingInactiveMembershipsByChannels = async (
  ctx: DbContext,
  { channelIds }: FindPendingInactiveMembershipsByChannelsOpts,
) => {
  const { db } = ctx.var;
  if (!channelIds.length) return [];
  return db
    .select()
    .from(inactiveMembershipsTable)
    .where(and(inArray(inactiveMembershipsTable.channelId, channelIds), isNull(inactiveMembershipsTable.rejectedAt)));
};

interface StampInactiveMembershipsRemindedOpts {
  ids: string[];
  remindedAt: string;
}

/** Stamp remindedAt (last email dispatch) on inactive memberships. */
export const stampInactiveMembershipsReminded = async (
  ctx: DbContext,
  { ids, remindedAt }: StampInactiveMembershipsRemindedOpts,
) => {
  const { db } = ctx.var;
  if (!ids.length) return;
  return db.update(inactiveMembershipsTable).set({ remindedAt }).where(inArray(inactiveMembershipsTable.id, ids));
};

interface UpdateInactiveMembershipTokenOpts {
  id: string;
  tokenId: string;
}

/** Point an inactive membership at a fresh invitation token (rotation at deferred dispatch). */
export const updateInactiveMembershipToken = async (
  ctx: DbContext,
  { id, tokenId }: UpdateInactiveMembershipTokenOpts,
) => {
  const { db } = ctx.var;
  return db.update(inactiveMembershipsTable).set({ tokenId }).where(eq(inactiveMembershipsTable.id, id));
};

interface FindMembershipByIdInOrgOpts {
  membershipId: string;
}

export const findMembershipByIdInOrg = async (ctx: OrgContext, { membershipId }: FindMembershipByIdInOrgOpts) => {
  const { db, organizationId } = ctx.var;
  const [membership] = await db
    .select(membershipBaseSelect)
    .from(membershipsTable)
    .where(and(eq(membershipsTable.id, membershipId), eq(membershipsTable.organizationId, organizationId)))
    .limit(1);
  return membership;
};

interface FindMembershipsByUserIdsAndChannelOpts {
  userIds: string[];
  channelId: string;
}

export const findMembershipsByUserIdsAndChannel = async (
  ctx: DbContext,
  { userIds, channelId }: FindMembershipsByUserIdsAndChannelOpts,
) => {
  const { db } = ctx.var;
  return db
    .select(membershipBaseSelect)
    .from(membershipsTable)
    .where(and(inArray(membershipsTable.userId, userIds), eq(membershipsTable.channelId, channelId)));
};

interface DeleteMembershipsByIdsOpts {
  ids: string[];
}

export const deleteMembershipsByIds = async (ctx: OrgContext, { ids }: DeleteMembershipsByIdsOpts) => {
  const { db, organizationId } = ctx.var;
  return db
    .delete(membershipsTable)
    .where(and(inArray(membershipsTable.id, ids), eq(membershipsTable.organizationId, organizationId)));
};

interface UpdateMembershipOpts {
  id: string;
  values: Partial<typeof membershipsTable.$inferInsert>;
}

export const updateMembership = async (ctx: OrgContext, { id, values }: UpdateMembershipOpts) => {
  const { db, organizationId } = ctx.var;
  const [updated] = await db
    .update(membershipsTable)
    .set(values)
    .where(and(eq(membershipsTable.id, id), eq(membershipsTable.organizationId, organizationId)))
    .returning();
  return updated;
};

interface InsertInactiveMembershipsOpts {
  memberships: (typeof inactiveMembershipsTable.$inferInsert)[];
}

/** Insert inactive memberships in bulk, ignoring conflicts. */
export const insertInactiveMemberships = async (ctx: DbContext, { memberships }: InsertInactiveMembershipsOpts) => {
  const { db } = ctx.var;
  return db.insert(inactiveMembershipsTable).values(memberships).onConflictDoNothing().returning({
    id: inactiveMembershipsTable.id,
    email: inactiveMembershipsTable.email,
  });
};

interface FindInactiveMembershipByIdOpts {
  id: string;
}

export const findInactiveMembershipById = async (ctx: DbContext, { id }: FindInactiveMembershipByIdOpts) => {
  const { db } = ctx.var;
  const [membership] = await db.select().from(inactiveMembershipsTable).where(eq(inactiveMembershipsTable.id, id));
  return membership;
};

interface FindInactiveMembershipForUserOpts {
  id: string;
}

export const findInactiveMembershipForUser = async (ctx: UserContext, { id }: FindInactiveMembershipForUserOpts) => {
  const { db, userId } = ctx.var;
  const [membership] = await db
    .select()
    .from(inactiveMembershipsTable)
    .where(and(eq(inactiveMembershipsTable.id, id), eq(inactiveMembershipsTable.userId, userId)))
    .limit(1);
  return membership;
};

/**
 * An invitation is claimable by a user while it is unbound, or already bound to that same user. Every write that
 * binds an invitation goes through this condition, so a row bound to someone else is never re-bound (GHSA-fmh4-wcc4-5jm3).
 */
const claimableBy = (userId: string) =>
  or(isNull(inactiveMembershipsTable.userId), eq(inactiveMembershipsTable.userId, userId));

/** Token path: the invitation is answerable by this user when {@link claimableBy} holds. */
export const findClaimableInactiveMembership = async (ctx: UserContext, { id }: FindInactiveMembershipForUserOpts) => {
  const { db, userId } = ctx.var;
  const [membership] = await db
    .select()
    .from(inactiveMembershipsTable)
    .where(and(eq(inactiveMembershipsTable.id, id), claimableBy(userId)))
    .limit(1);
  return membership;
};

interface BindInactiveMembershipsOpts {
  ids: string[];
  userId: string;
}

/** Binds claimable invitations to the user and returns the ids it bound; an id missing from the result lost a race or belongs to someone else. */
export const bindInactiveMemberships = async (ctx: DbContext, { ids, userId }: BindInactiveMembershipsOpts) => {
  if (!ids.length) return [];
  const { db } = ctx.var;
  const bound = await db
    .update(inactiveMembershipsTable)
    .set({ userId })
    .where(and(inArray(inactiveMembershipsTable.id, ids), claimableBy(userId)))
    .returning({ id: inactiveMembershipsTable.id });
  return bound.map((row) => row.id);
};

interface BindInactiveMembershipsByEmailOpts {
  email: string;
  userId: string;
}

/** Binds every unbound invitation addressed to `email` and returns the ids it bound. The caller has proven that inbox. */
export const bindInactiveMembershipsByEmail = async (
  ctx: DbContext,
  { email, userId }: BindInactiveMembershipsByEmailOpts,
) => {
  const { db } = ctx.var;
  const bound = await db
    .update(inactiveMembershipsTable)
    .set({ userId })
    .where(and(eq(inactiveMembershipsTable.email, email), isNull(inactiveMembershipsTable.userId)))
    .returning({ id: inactiveMembershipsTable.id });
  return bound.map((row) => row.id);
};

interface UnbindInactiveMembershipsOpts {
  userIds: string[];
}

/** Releases invitations from users about to be removed, so they survive the cascade and wait for whoever proves the address. */
export const unbindInactiveMemberships = async (ctx: DbContext, { userIds }: UnbindInactiveMembershipsOpts) => {
  if (!userIds.length) return;
  const { db } = ctx.var;
  await db
    .update(inactiveMembershipsTable)
    .set({ userId: null })
    .where(inArray(inactiveMembershipsTable.userId, userIds));
};

interface FindMembersPaginatedOpts {
  organizationId: string;
  entityId: string;
  entityType: ChannelEntityType;
  q?: string;
  sort?: 'id' | 'name' | 'email' | 'createdAt' | 'lastSeenAt' | 'role' | 'lastPostedAt';
  order?: 'asc' | 'desc';
  offset: number;
  limit: number;
  role?: EntityRole;
  userIds?: string[];
  // Opt-in per-member insight counts; caller must run under tenantRead (product subqueries are RLS-guarded)
  includeCounts?: boolean;
}

export const findMembersPaginated = async (ctx: DbContext, opts: FindMembersPaginatedOpts) => {
  const { db } = ctx.var;
  const { organizationId, entityId, entityType, q, sort, order, offset, limit, role, userIds, includeCounts } = opts;

  const $or = q
    ? [ilike(usersTable.name, prepareStringForILikeFilter(q)), ilike(usersTable.email, prepareStringForILikeFilter(q))]
    : [];

  const membersFilters: SQL[] = [
    eq(membershipsTable.organizationId, organizationId),
    eq(membershipsTable.channelId, entityId),
    eq(membershipsTable.channelType, entityType),
  ];

  if (role) membersFilters.push(eq(membershipsTable.role, role));
  if (userIds?.length) membersFilters.push(inArray(usersTable.id, userIds));

  const orderBy = getOrderColumns({
    sort,
    order,
    fallback: ['createdAt', 'desc'],
    columns: {
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      createdAt: usersTable.createdAt,
      // COALESCE so never-signed-in members sort as oldest: plain DESC is NULLS FIRST in Postgres
      lastSeenAt: sql`COALESCE((SELECT ${userCountersTable.lastSeenAt} FROM ${userCountersTable} WHERE ${userCountersTable.userId} = ${usersTable.id}), '-infinity')`,
      role: membershipsTable.role,
      // Latest live product row by the member in the viewed channel; RLS-guarded like the counts
      lastPostedAt: lastPostedAtOrder(entityType, entityId, organizationId),
    },
    tieBreaker: usersTable.id,
  });

  const membersQuery = db
    .select({
      ...memberSelect,
      membership: membershipBaseSelect,
      // Per-member insight counts on the page rows only; the total below stays free of the subqueries
      ...(includeCounts && { counts: memberCountsSelect(entityType, entityId, organizationId) }),
    })
    .from(usersTable)
    .innerJoin(membershipsTable, eq(membershipsTable.userId, usersTable.id))
    .where(and(...membersFilters, or(...$or)));

  const itemsQuery = membersQuery
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset);

  // Totals count over a slim id-only query, so include=counts never evaluates its subqueries channel-wide
  const totalQuery = db
    .select({ id: usersTable.id })
    .from(usersTable)
    .innerJoin(membershipsTable, eq(membershipsTable.userId, usersTable.id))
    .where(and(...membersFilters, or(...$or)));

  return resolveListTotal(itemsQuery, {
    kind: 'exact',
    getTotal: async () => {
      const [{ total }] = await db.select({ total: count() }).from(totalQuery.as('members'));
      return total;
    },
  });
};

interface FindMemberPreviewsByChannelsOpts {
  channelType: ChannelEntityType;
  channelIds: string[];
  role: EntityRole;
  limit: number;
}

/**
 * Member previews for a set of contexts in one batched query: the first `limit` members per context with the given
 * role, oldest membership first. Overflow counts come from the `m:c:{role}` counters, so previews need no second query.
 */
export const findMemberPreviewsByChannels = async (
  ctx: DbContext,
  { channelType, channelIds, role, limit }: FindMemberPreviewsByChannelsOpts,
) => {
  const { db } = ctx.var;
  const previews = new Map<string, UserMinimalBase[]>();
  if (!channelIds.length) return previews;

  // Rank members per context so a single query returns at most `limit` rows per context
  const rowNumber = sql<number>`row_number() over (
      partition by ${membershipsTable.channelId} order by ${membershipsTable.createdAt} asc
    )`.as('row_number');

  const rankedMembers = db
    .select({
      channelId: membershipsTable.channelId,
      id: usersTable.id,
      name: usersTable.name,
      slug: usersTable.slug,
      thumbnailUrl: usersTable.thumbnailUrl,
      rowNumber,
    })
    .from(membershipsTable)
    .innerJoin(usersTable, eq(usersTable.id, membershipsTable.userId))
    .where(
      and(
        eq(membershipsTable.channelType, channelType),
        inArray(membershipsTable.channelId, channelIds),
        eq(membershipsTable.role, role),
      ),
    )
    .as('ranked_members');

  const rows = await db
    .select({
      channelId: rankedMembers.channelId,
      id: rankedMembers.id,
      name: rankedMembers.name,
      slug: rankedMembers.slug,
      thumbnailUrl: rankedMembers.thumbnailUrl,
    })
    .from(rankedMembers)
    .where(lte(rankedMembers.rowNumber, limit))
    .orderBy(rankedMembers.channelId, rankedMembers.rowNumber);

  // Group per context, preserving the createdAt order from the window function
  for (const { channelId, ...user } of rows) {
    const list = previews.get(channelId) ?? [];
    list.push({ ...user, entityType: 'user' });
    previews.set(channelId, list);
  }

  return previews;
};

interface FindPendingMembershipsPaginatedOpts {
  organizationId: string;
  entityId: string;
  sort?: 'createdAt';
  order?: 'asc' | 'desc';
  offset: number;
  limit: number;
}

/**
 * A channel's invitations as the inviter sees them: the address each went to, never the account that may hold it, so a
 * row looks the same whether the invitee already has an account or not.
 */
export const findPendingMembershipsPaginated = async (ctx: DbContext, opts: FindPendingMembershipsPaginatedOpts) => {
  const { db } = ctx.var;
  const { organizationId, entityId, sort, order, offset, limit } = opts;

  const table = inactiveMembershipsTable;
  const orderBy = getOrderColumns({
    sort,
    order,
    fallback: ['createdAt', 'desc'],
    columns: { createdAt: table.createdAt },
    tieBreaker: table.id,
  });

  const pendingMembershipsQuery = db
    .select({
      id: table.id,
      role: table.role,
      email: table.email,
      createdAt: table.createdAt,
      createdBy: table.createdBy,
    })
    .from(table)
    .where(and(eq(table.channelId, entityId), eq(table.organizationId, organizationId)));

  const itemsQuery = pendingMembershipsQuery
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset);

  return resolveListTotal(itemsQuery, {
    kind: 'exact',
    getTotal: async () => {
      const [{ total }] = await db.select({ total: count() }).from(pendingMembershipsQuery.as('pendingMemberships'));
      return total;
    },
  });
};
