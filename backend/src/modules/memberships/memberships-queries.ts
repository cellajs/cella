import { and, count, eq, ilike, inArray, isNull, lte, or, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { ChannelEntityType, EntityRole } from 'shared';
import type { AuthContext, DbContext } from '#/core/context';
import { tokensTable } from '#/modules/auth/tokens-db';
import { membershipBaseSelect } from '#/modules/memberships/helpers/select';
import { inactiveMembershipsTable } from '#/modules/memberships/inactive-memberships-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { emailsTable } from '#/modules/user/emails-db';
import type { UserMinimalBase } from '#/modules/user/helpers/audit-user';
import { memberSelect, userBaseSelect } from '#/modules/user/helpers/select';
import { userCountersTable } from '#/modules/user/user-counters-db';
import { usersTable } from '#/modules/user/user-db';
import { getOrderColumn } from '#/utils/order-column';
import { prepareStringForILikeFilter } from '#/utils/sql';

interface CountMembershipsByChannelOpts {
  channelType: ChannelEntityType;
  channelId: string;
}

/** Count active memberships for a channel entity. */
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

/** Count pending invitations for a channel entity. */
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

interface FindMembershipAwareRowsOpts {
  emails: string[];
  entityType: ChannelEntityType;
  entityId: string;
}

/** Membership-aware lookup for a list of emails against a target entity. */
export const findMembershipAwareRows = async (
  ctx: AuthContext,
  { emails, entityType, entityId }: FindMembershipAwareRowsOpts,
) => {
  const { db, organizationId } = ctx.var;
  const orgMemberships = alias(membershipsTable, 'org_memberships');
  const rootChannelType = 'organization' as const;

  return db
    .select({
      email: emailsTable.email,
      userId: usersTable.id,
      language: usersTable.language,
      membershipId: membershipsTable.id,
      inactiveMembershipId: inactiveMembershipsTable.id,
      // Last dispatch timestamps for the reminder throttle (remindedAt ?? createdAt)
      inactiveMembershipCreatedAt: inactiveMembershipsTable.createdAt,
      inactiveMembershipRemindedAt: inactiveMembershipsTable.remindedAt,
      orgMembershipId: orgMemberships.id,
      tokenId: tokensTable.id,
    })
    .from(emailsTable)
    .leftJoin(usersTable, eq(usersTable.id, emailsTable.userId))
    .leftJoin(
      membershipsTable,
      and(
        eq(membershipsTable.userId, usersTable.id),
        eq(membershipsTable.channelType, entityType),
        eq(membershipsTable.channelId, entityId),
      ),
    )
    .leftJoin(
      inactiveMembershipsTable,
      and(
        eq(inactiveMembershipsTable.channelType, entityType),
        eq(inactiveMembershipsTable.channelId, entityId),
        or(eq(inactiveMembershipsTable.userId, usersTable.id), eq(inactiveMembershipsTable.email, emailsTable.email)),
      ),
    )
    .leftJoin(
      tokensTable,
      and(eq(tokensTable.id, inactiveMembershipsTable.tokenId), eq(tokensTable.type, 'invitation')),
    )
    .leftJoin(
      orgMemberships,
      and(
        eq(orgMemberships.userId, usersTable.id),
        eq(orgMemberships.channelType, rootChannelType),
        eq(orgMemberships.channelId, organizationId),
      ),
    )
    .where(and(inArray(emailsTable.email, emails)));
};

/** Pending (not rejected) inactive memberships for a set of contexts (deferred-invite dispatch). */
export const findPendingInactiveMembershipsByChannels = async (
  ctx: DbContext,
  { channelIds }: { channelIds: string[] },
) => {
  const { db } = ctx.var;
  if (!channelIds.length) return [];
  return db
    .select()
    .from(inactiveMembershipsTable)
    .where(and(inArray(inactiveMembershipsTable.channelId, channelIds), isNull(inactiveMembershipsTable.rejectedAt)));
};

/** Stamp remindedAt (last email dispatch) on inactive memberships. */
export const stampInactiveMembershipsReminded = async (
  ctx: DbContext,
  { ids, remindedAt }: { ids: string[]; remindedAt: string },
) => {
  const { db } = ctx.var;
  if (!ids.length) return;
  return db.update(inactiveMembershipsTable).set({ remindedAt }).where(inArray(inactiveMembershipsTable.id, ids));
};

/** Point an inactive membership at a fresh invitation token (rotation at deferred dispatch). */
export const updateInactiveMembershipToken = async (
  ctx: DbContext,
  { id, tokenId }: { id: string; tokenId: string },
) => {
  const { db } = ctx.var;
  return db.update(inactiveMembershipsTable).set({ tokenId }).where(eq(inactiveMembershipsTable.id, id));
};

interface FindMembershipByIdInOrgOpts {
  membershipId: string;
}

/** Find a membership by ID scoped to an organization. */
export const findMembershipByIdInOrg = async (ctx: AuthContext, { membershipId }: FindMembershipByIdInOrgOpts) => {
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

/** Find memberships for deletion targets (by user IDs and context). */
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

/** Delete memberships by IDs. */
export const deleteMembershipsByIds = async (ctx: AuthContext, { ids }: DeleteMembershipsByIdsOpts) => {
  const { db, organizationId } = ctx.var;
  return db
    .delete(membershipsTable)
    .where(and(inArray(membershipsTable.id, ids), eq(membershipsTable.organizationId, organizationId)));
};

interface UpdateMembershipOpts {
  id: string;
  values: Partial<typeof membershipsTable.$inferInsert>;
}

/** Update a membership by ID and return the updated row. */
export const updateMembership = async (ctx: AuthContext, { id, values }: UpdateMembershipOpts) => {
  const { db, organizationId } = ctx.var;
  const [updated] = await db
    .update(membershipsTable)
    .set(values)
    .where(and(eq(membershipsTable.id, id), eq(membershipsTable.organizationId, organizationId)))
    .returning();
  return updated;
};

/** Insert tokens in bulk and return the created rows. */
export const insertTokens = async (ctx: DbContext, { tokens }: { tokens: (typeof tokensTable.$inferInsert)[] }) => {
  const { db } = ctx.var;
  return db.insert(tokensTable).values(tokens).returning({
    id: tokensTable.id,
    email: tokensTable.email,
    secret: tokensTable.secret,
    type: tokensTable.type,
  });
};

/** Insert inactive memberships in bulk, ignoring conflicts. */
export const insertInactiveMemberships = async (
  ctx: DbContext,
  { memberships }: { memberships: (typeof inactiveMembershipsTable.$inferInsert)[] },
) => {
  const { db } = ctx.var;
  return db.insert(inactiveMembershipsTable).values(memberships).onConflictDoNothing().returning({
    id: inactiveMembershipsTable.id,
    email: inactiveMembershipsTable.email,
  });
};

interface FindInactiveMembershipForUserOpts {
  id: string;
}

/** Find an inactive membership by ID for a specific user. */
export const findInactiveMembershipForUser = async (ctx: AuthContext, { id }: FindInactiveMembershipForUserOpts) => {
  const { db, userId } = ctx.var;
  const [membership] = await db
    .select()
    .from(inactiveMembershipsTable)
    .where(and(eq(inactiveMembershipsTable.id, id), eq(inactiveMembershipsTable.userId, userId)))
    .limit(1);
  return membership;
};

interface GetMembersListOpts {
  organizationId: string;
  entityId: string;
  entityType: ChannelEntityType;
  q?: string;
  sort?: 'id' | 'name' | 'email' | 'createdAt' | 'lastSeenAt' | 'role';
  order?: 'asc' | 'desc';
  offset: number;
  limit: number;
  role?: EntityRole;
  userIds?: string;
}

/** Get paginated members list with total count for an entity. */
export const getMembersList = async (ctx: DbContext, opts: GetMembersListOpts) => {
  const { db } = ctx.var;
  const { organizationId, entityId, entityType, q, sort, order, offset, limit, role, userIds } = opts;

  const $or = q
    ? [ilike(usersTable.name, prepareStringForILikeFilter(q)), ilike(usersTable.email, prepareStringForILikeFilter(q))]
    : [];

  const membersFilters: SQL[] = [
    eq(membershipsTable.organizationId, organizationId),
    eq(membershipsTable.channelId, entityId),
    eq(membershipsTable.channelType, entityType),
  ];

  if (role) membersFilters.push(eq(membershipsTable.role, role));
  if (userIds) membersFilters.push(inArray(usersTable.id, userIds.split(',')));

  const orderColumn = getOrderColumn(sort, usersTable.id, order, {
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
    createdAt: usersTable.createdAt,
    lastSeenAt: sql`(SELECT ${userCountersTable.lastSeenAt} FROM ${userCountersTable} WHERE ${userCountersTable.userId} = ${usersTable.id})`,
    role: membershipsTable.role,
  });

  const membersQuery = db
    .select({
      ...memberSelect,
      membership: membershipBaseSelect,
    })
    .from(usersTable)
    .innerJoin(membershipsTable, eq(membershipsTable.userId, usersTable.id))
    .where(and(...membersFilters, or(...$or)));

  const [{ total }] = await db.select({ total: count() }).from(membersQuery.as('members'));
  const items = await membersQuery.orderBy(orderColumn).limit(limit).offset(offset);

  return { items, total };
};

interface FindMemberPreviewsByChannelsOpts {
  channelType: ChannelEntityType;
  channelIds: string[];
  role: EntityRole;
  limit: number;
}

/**
 * Member previews for a set of contexts in ONE batched query: the first `limit` members
 * per context with the given role, ordered by membership createdAt (oldest first).
 * Powers `include=members` on channel entity list endpoints; overflow counts come from
 * the pre-computed `m:c:{role}` counters, so previews never need a second query.
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

interface GetPendingMembershipsListOpts {
  organizationId: string;
  entityId: string;
  sort?: 'createdAt';
  order?: 'asc' | 'desc';
  offset: number;
  limit: number;
}

/** Get paginated pending memberships list with total count. */
export const getPendingMembershipsList = async (ctx: DbContext, opts: GetPendingMembershipsListOpts) => {
  const { db } = ctx.var;
  const { organizationId, entityId, sort, order, offset, limit } = opts;

  const table = inactiveMembershipsTable;
  const orderColumn = getOrderColumn(sort, table.createdAt, order, { createdAt: table.createdAt });

  const pendingMembershipsQuery = db
    .select({
      id: table.id,
      role: table.role,
      userId: table.userId,
      email: sql<string>`coalesce(
        ${userBaseSelect.email},
        ${tokensTable.email}
        )`.as('email'),
      thumbnailUrl: sql<string | null>`${userBaseSelect.thumbnailUrl}`.as('thumbnailUrl'),
      createdAt: table.createdAt,
      createdBy: table.createdBy,
    })
    .from(table)
    .leftJoin(usersTable, eq(usersTable.id, table.userId))
    .leftJoin(tokensTable, and(eq(tokensTable.inactiveMembershipId, table.id), eq(tokensTable.type, 'invitation')))
    .where(and(eq(table.channelId, entityId), eq(table.organizationId, organizationId)))
    .orderBy(orderColumn);

  const [{ total }] = await db.select({ total: count() }).from(pendingMembershipsQuery.as('pendingMemberships'));
  const rawItems = await pendingMembershipsQuery.limit(limit).offset(offset);

  return { rawItems, total };
};
