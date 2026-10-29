import { and, count, eq, inArray, lte, max, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { ChannelEntityType, EntityRole } from 'shared';
import type { DbContext, OrgContext } from '#/core/context';
import { resolveListTotal } from '#/db/utils/list-total';
import { actorsTable } from '#/modules/actors/actors-db';
import { lastPostedAtOrder, memberCountsSelect } from '#/modules/memberships/helpers/member-counts';
import { membershipBaseSelect } from '#/modules/memberships/helpers/select';
import { type InsertMembershipModel, membershipsTable } from '#/modules/memberships/memberships-db';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { emailsTable } from '#/modules/user/emails-db';
import { lastSeenOrder, memberSelect, userActorJoin } from '#/modules/user/helpers/select';
import type { UserMinimalBase } from '#/modules/user/helpers/user-minimal';
import { usersTable } from '#/modules/user/user-db';
import { getOrderColumns } from '#/utils/order-column';
import { searchFilter } from '#/utils/sql';

interface CountMembershipsByChannelOpts {
  channelType: ChannelEntityType;
  channelId: string;
}

/** The number of memberships of one channel. */
export const countMembershipsByChannel = async (ctx: DbContext, { channelType, channelId }: CountMembershipsByChannelOpts) => {
  const { db } = ctx.var;
  const [{ total }] = await db
    .select({ total: count() })
    .from(membershipsTable)
    .where(and(eq(membershipsTable.channelType, channelType), eq(membershipsTable.channelId, channelId)));
  return total;
};

interface FindInviteeAccountsOpts {
  emails: string[];
  entityType: ChannelEntityType;
  entityId: string;
}

/**
 * The accounts behind invited addresses, one row per address an account holds: its primary address, its membership
 * of the channel (with the role) and whether it is a member of the organization. Addresses no account holds have no row.
 */
export const findInviteeAccounts = async (ctx: OrgContext, { emails, entityType, entityId }: FindInviteeAccountsOpts) => {
  const { db, organizationId } = ctx.var;
  const orgMemberships = alias(membershipsTable, 'org_memberships');

  return db
    .select({
      email: emailsTable.email,
      userId: usersTable.id,
      primaryEmail: usersTable.email,
      membershipId: membershipsTable.id,
      membershipRole: membershipsTable.role,
      orgMembershipId: orgMemberships.id,
    })
    .from(emailsTable)
    .innerJoin(usersTable, eq(usersTable.id, emailsTable.userId))
    .leftJoin(
      membershipsTable,
      and(eq(membershipsTable.userId, usersTable.id), eq(membershipsTable.channelType, entityType), eq(membershipsTable.channelId, entityId)),
    )
    .leftJoin(
      orgMemberships,
      and(eq(orgMemberships.userId, usersTable.id), eq(orgMemberships.channelType, 'organization'), eq(orgMemberships.channelId, organizationId)),
    )
    .where(inArray(emailsTable.email, emails));
};

interface FindAccountLanguagesOpts {
  userIds: string[];
}

/** Each account's language, for a mail an invited account reads in its own. */
export const findAccountLanguages = async (ctx: DbContext, { userIds }: FindAccountLanguagesOpts) => {
  if (!userIds.length) return new Map<string, string>();
  const rows = await ctx.var.db.select({ id: usersTable.id, language: usersTable.language }).from(usersTable).where(inArray(usersTable.id, userIds));
  return new Map(rows.map((row) => [row.id, row.language]));
};

interface FindMembershipByIdInOrgOpts {
  membershipId: string;
}

/** A membership of the request's organization by id, as `MembershipBase`; one of another organization reads as missing. */
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

/** The channel's memberships of these users, as `MembershipBase`; a user without one has no row. */
export const findMembershipsByUserIdsAndChannel = async (ctx: DbContext, { userIds, channelId }: FindMembershipsByUserIdsAndChannelOpts) => {
  const { db } = ctx.var;
  return db
    .select(membershipBaseSelect)
    .from(membershipsTable)
    .where(and(inArray(membershipsTable.userId, userIds), eq(membershipsTable.channelId, channelId)));
};

interface DeleteMembershipsByIdsOpts {
  ids: string[];
}

/** Deletes memberships by id, only those of the request's organization. */
export const deleteMembershipsByIds = async (ctx: OrgContext, { ids }: DeleteMembershipsByIdsOpts) => {
  const { db, organizationId } = ctx.var;
  return db.delete(membershipsTable).where(and(inArray(membershipsTable.id, ids), eq(membershipsTable.organizationId, organizationId)));
};

interface UpdateMembershipOpts {
  id: string;
  values: Partial<typeof membershipsTable.$inferInsert>;
}

/** Updates a membership of the request's organization and returns the row; undefined when none has the id. */
export const updateMembership = async (ctx: OrgContext, { id, values }: UpdateMembershipOpts) => {
  const { db, organizationId } = ctx.var;
  const [updated] = await db
    .update(membershipsTable)
    .set(values)
    .where(and(eq(membershipsTable.id, id), eq(membershipsTable.organizationId, organizationId)))
    .returning();
  return updated;
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
  /** Per-member counts on the page rows (`memberCountsSelect`). */
  includeCounts?: boolean;
  /** Each member's MFA switch; the caller decides who may see it. */
  includeMfa?: boolean;
}

/** A page of a channel's members, each user with its membership, and the total. */
export const findMembersPaginated = async (ctx: DbContext, opts: FindMembersPaginatedOpts) => {
  const { db } = ctx.var;
  const { organizationId, entityId, entityType, q, sort, order, offset, limit, role, userIds, includeCounts, includeMfa } = opts;

  const search = searchFilter([usersTable.name, usersTable.email], q);

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
      lastSeenAt: lastSeenOrder,
      role: membershipsTable.role,
      // Latest live product row by the member in the viewed channel
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
      ...(includeMfa && { mfaRequired: usersTable.mfaRequired }),
    })
    .from(usersTable)
    .innerJoin(membershipsTable, eq(membershipsTable.userId, usersTable.id))
    .innerJoin(actorsTable, userActorJoin)
    .where(and(...membersFilters, search));

  const itemsQuery = membersQuery
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset);

  // Totals count over a slim id-only query, so include=counts never evaluates its subqueries channel-wide
  const totalQuery = db
    .select({ id: usersTable.id })
    .from(usersTable)
    .innerJoin(membershipsTable, eq(membershipsTable.userId, usersTable.id))
    .where(and(...membersFilters, search));

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
 * Member previews for a set of channels in one batched query: the first `limit` members per channel with the given
 * role, oldest membership first. Overflow counts come from the `m:c:{role}` counters, so previews need no second query.
 */
export const findMemberPreviewsByChannels = async (ctx: DbContext, { channelType, channelIds, role, limit }: FindMemberPreviewsByChannelsOpts) => {
  const { db } = ctx.var;
  const previews = new Map<string, UserMinimalBase[]>();
  if (!channelIds.length) return previews;

  // Rank members per channel so a single query returns at most `limit` rows per channel
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
    .where(and(eq(membershipsTable.channelType, channelType), inArray(membershipsTable.channelId, channelIds), eq(membershipsTable.role, role)))
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

  // Group per channel, preserving the createdAt order from the window function
  for (const { channelId, ...user } of rows) {
    const list = previews.get(channelId) ?? [];
    list.push({ ...user, entityType: 'user' });
    previews.set(channelId, list);
  }

  return previews;
};

interface FindMaxDisplayOrdersOpts {
  userIds: string[];
}

/** Each user's highest membership `displayOrder`, the baseline for the next; a user without memberships has no row. */
export const findMaxDisplayOrders = async (ctx: DbContext, { userIds }: FindMaxDisplayOrdersOpts) => {
  return ctx.var.db
    .select({ userId: membershipsTable.userId, maxOrder: max(membershipsTable.displayOrder) })
    .from(membershipsTable)
    .where(inArray(membershipsTable.userId, userIds))
    .groupBy(membershipsTable.userId);
};

interface InsertMembershipRowsOpts {
  values: InsertMembershipModel[];
}

/** Inserts membership rows and returns them as `MembershipBase`. */
export const insertMembershipRows = async (ctx: DbContext, { values }: InsertMembershipRowsOpts) => {
  return ctx.var.db.insert(membershipsTable).values(values).returning(membershipBaseSelect);
};

/** Inserts the membership rows that do not exist yet; the unique constraint skips the others. */
export const insertMissingMembershipRows = async (ctx: DbContext, { values }: InsertMembershipRowsOpts) => {
  await ctx.var.db.insert(membershipsTable).values(values).onConflictDoNothing();
};

interface FindMembershipsByUserIdsOpts {
  userIds: string[];
}

/** A membership counts while its tenant is not archived: an organization deleted by its admin leaves every member's list at once. */
export const inUnarchivedTenant = (tenantId: typeof membershipsTable.tenantId) =>
  sql`NOT EXISTS (SELECT 1 FROM ${tenantsTable} WHERE ${tenantsTable.id} = ${tenantId} AND ${tenantsTable.status} = 'archived')`;

/** Every membership of these users that counts, in any organization, as a session reads its own (`loadMemberships`). */
export const findMembershipsByUserIds = async (ctx: DbContext, { userIds }: FindMembershipsByUserIdsOpts) => {
  return ctx.var.db
    .select()
    .from(membershipsTable)
    .where(and(inArray(membershipsTable.userId, userIds), inUnarchivedTenant(membershipsTable.tenantId)));
};

interface RotateTenantMemberBindingsOpts {
  tenantId: string;
}

/**
 * Gives every member of the tenant a new `actors.bindings_version`, as a membership write does through its trigger, so
 * their cached memberships reload: `loadMemberships` reads the tenant's status, which no membership trigger sees change.
 * @returns The members' user ids.
 */
export const rotateTenantMemberBindings = async (ctx: DbContext, { tenantId }: RotateTenantMemberBindingsOpts): Promise<string[]> => {
  const rotated = await ctx.var.db
    .update(actorsTable)
    .set({ bindingsVersion: sql`gen_random_uuid()` })
    .where(
      inArray(
        actorsTable.id,
        ctx.var.db.select({ id: membershipsTable.userId }).from(membershipsTable).where(eq(membershipsTable.tenantId, tenantId)),
      ),
    )
    .returning({ id: actorsTable.id });
  return rotated.map(({ id }) => id);
};
