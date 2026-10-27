import { and, count, countDistinct, eq, inArray, isNull, lte, max, notExists, notInArray, or, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { ChannelEntityType, EntityRole } from 'shared';
import type { DbContext, OrgContext, UserContext } from '#/core/context';
import { resolveListTotal } from '#/db/utils/list-total';
import { actorsTable } from '#/modules/actors/actors-db';
import { lastPostedAtOrder, memberCountsSelect } from '#/modules/memberships/helpers/member-counts';
import { membershipBaseSelect } from '#/modules/memberships/helpers/select';
import { inactiveMembershipsTable } from '#/modules/memberships/inactive-memberships-db';
import { type InsertMembershipModel, membershipsTable } from '#/modules/memberships/memberships-db';
import { emailsTable } from '#/modules/user/emails-db';
import { lastSeenOrder, memberSelect, userActorJoin } from '#/modules/user/helpers/select';
import type { UserMinimalBase } from '#/modules/user/helpers/user-minimal';
import { usersTable } from '#/modules/user/user-db';
import { getIsoDate } from '#/utils/iso-date';
import { getOrderColumns } from '#/utils/order-column';
import { textSearchFilter } from '#/utils/sql';

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

interface CountPendingInactiveMembershipSeatsOpts {
  organizationId: string;
  /** Addresses the caller charges a seat for itself; their pending invitations are not counted again. */
  exceptEmails?: string[];
}

/**
 * The organization's seats its pending invitations hold: each address with an invitation still waiting for an answer,
 * to the organization or to any channel below it, counted once, since accepting either makes an organization member.
 * An invitation bound to an account that is a member already, or a rejected one, holds none.
 */
export const countPendingInactiveMembershipSeats = async (
  ctx: DbContext,
  { organizationId, exceptEmails = [] }: CountPendingInactiveMembershipSeatsOpts,
) => {
  const { db } = ctx.var;
  const orgMembership = db
    .select({ id: membershipsTable.id })
    .from(membershipsTable)
    .where(
      and(
        eq(membershipsTable.userId, inactiveMembershipsTable.userId),
        eq(membershipsTable.channelType, 'organization'),
        eq(membershipsTable.channelId, organizationId),
      ),
    );
  const [{ seats }] = await db
    .select({ seats: countDistinct(inactiveMembershipsTable.email) })
    .from(inactiveMembershipsTable)
    .where(
      and(
        eq(inactiveMembershipsTable.organizationId, organizationId),
        isNull(inactiveMembershipsTable.rejectedAt),
        notExists(orgMembership),
        exceptEmails.length ? notInArray(inactiveMembershipsTable.email, exceptEmails) : undefined,
      ),
    );
  return seats;
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

interface FindInactiveMembershipsByEmailsOpts {
  emails: string[];
  channelId: string;
}

/** The channel's inactive memberships addressed to exactly these addresses, pending or rejected. */
export const findInactiveMembershipsByEmails = async (ctx: DbContext, { emails, channelId }: FindInactiveMembershipsByEmailsOpts) => {
  const { db } = ctx.var;
  if (!emails.length) return [];
  return db
    .select({
      id: inactiveMembershipsTable.id,
      email: inactiveMembershipsTable.email,
      userId: inactiveMembershipsTable.userId,
      role: inactiveMembershipsTable.role,
      rejectedAt: inactiveMembershipsTable.rejectedAt,
      createdAt: inactiveMembershipsTable.createdAt,
      remindedAt: inactiveMembershipsTable.remindedAt,
    })
    .from(inactiveMembershipsTable)
    .where(and(eq(inactiveMembershipsTable.channelId, channelId), inArray(inactiveMembershipsTable.email, emails)));
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

interface FindPendingInactiveMembershipsByChannelsOpts {
  channelIds: string[];
}

/** Pending (not rejected) inactive memberships of a set of channels. */
export const findPendingInactiveMembershipsByChannels = async (ctx: DbContext, { channelIds }: FindPendingInactiveMembershipsByChannelsOpts) => {
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

/** Stamps `remindedAt` on the invitations whose mail just went out: a first mail, a reminder, a resend or a dispatch. */
export const stampInactiveMembershipsReminded = async (ctx: DbContext, { ids, remindedAt }: StampInactiveMembershipsRemindedOpts) => {
  const { db } = ctx.var;
  if (!ids.length) return;
  return db.update(inactiveMembershipsTable).set({ remindedAt }).where(inArray(inactiveMembershipsTable.id, ids));
};

interface FindPendingInactiveMembershipOpts {
  id: string;
  /** Lock the row for the caller's transaction, so a concurrent answer, rejection or resend waits for it. */
  forUpdate?: boolean;
}

/** A membership invitation by id while it stands: not rejected. */
export const findPendingInactiveMembership = async (ctx: DbContext, { id, forUpdate = false }: FindPendingInactiveMembershipOpts) => {
  const query = ctx.var.db
    .select()
    .from(inactiveMembershipsTable)
    .where(and(eq(inactiveMembershipsTable.id, id), isNull(inactiveMembershipsTable.rejectedAt)));
  const [invitation] = forUpdate ? await query.for('update') : await query;
  return invitation;
};

interface FindPendingInactiveMembershipByEmailOpts {
  email: string;
}

/** A membership invitation to the address that stands, not rejected; undefined when none does. */
export const findPendingInactiveMembershipByEmail = async (ctx: DbContext, { email }: FindPendingInactiveMembershipByEmailOpts) => {
  const [invitation] = await ctx.var.db
    .select({ id: inactiveMembershipsTable.id })
    .from(inactiveMembershipsTable)
    .where(and(eq(inactiveMembershipsTable.email, email), isNull(inactiveMembershipsTable.rejectedAt)))
    .limit(1);
  return invitation;
};

interface FindPendingOrganizationInvitationOpts {
  email: string;
  organizationId: string;
}

/** An invitation to the address into the organization itself that stands, not rejected: it names the role a sign-in must not pre-empt. */
export const findPendingOrganizationInvitation = async (ctx: DbContext, { email, organizationId }: FindPendingOrganizationInvitationOpts) => {
  const [invitation] = await ctx.var.db
    .select({ id: inactiveMembershipsTable.id })
    .from(inactiveMembershipsTable)
    .where(
      and(
        eq(inactiveMembershipsTable.email, email),
        eq(inactiveMembershipsTable.channelType, 'organization'),
        eq(inactiveMembershipsTable.channelId, organizationId),
        isNull(inactiveMembershipsTable.rejectedAt),
      ),
    )
    .limit(1);
  return invitation;
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

interface InsertInactiveMembershipsOpts {
  memberships: (typeof inactiveMembershipsTable.$inferInsert)[];
}

/** Inserts inactive memberships and returns the ones inserted; a row whose address the channel invited already is skipped. */
export const insertInactiveMemberships = async (ctx: DbContext, { memberships }: InsertInactiveMembershipsOpts) => {
  const { db } = ctx.var;
  return db
    .insert(inactiveMembershipsTable)
    .values(memberships)
    .onConflictDoNothing()
    .returning({ id: inactiveMembershipsTable.id, email: inactiveMembershipsTable.email, userId: inactiveMembershipsTable.userId });
};

interface FindInactiveMembershipByIdOpts {
  id: string;
}

/** An inactive membership by id, of any organization, pending or rejected. */
export const findInactiveMembershipById = async (ctx: DbContext, { id }: FindInactiveMembershipByIdOpts) => {
  const { db } = ctx.var;
  const [membership] = await db.select().from(inactiveMembershipsTable).where(eq(inactiveMembershipsTable.id, id));
  return membership;
};

/** An inactive membership of the request's organization by id, pending or rejected; one of another organization reads as missing. */
export const findInactiveMembershipInOrg = async (ctx: OrgContext, { id }: FindInactiveMembershipByIdOpts) => {
  const { db, organizationId } = ctx.var;
  const [membership] = await db
    .select()
    .from(inactiveMembershipsTable)
    .where(and(eq(inactiveMembershipsTable.id, id), eq(inactiveMembershipsTable.organizationId, organizationId)));
  return membership;
};

interface FindInactiveMembershipForUserOpts {
  id: string;
}

/** Id path: a pending invitation bound to this user; a rejected one is answered and stays so. */
export const findInactiveMembershipForUser = async (ctx: UserContext, { id }: FindInactiveMembershipForUserOpts) => {
  const { db, userId } = ctx.var;
  const [membership] = await db
    .select()
    .from(inactiveMembershipsTable)
    .where(and(eq(inactiveMembershipsTable.id, id), eq(inactiveMembershipsTable.userId, userId), isNull(inactiveMembershipsTable.rejectedAt)))
    .limit(1);
  return membership;
};

/**
 * An invitation is claimable by a user while it is pending and unbound, or bound to that same user. Every write that
 * binds an invitation goes through this condition, so a row bound to someone else is never re-bound (GHSA-fmh4-wcc4-5jm3)
 * and a rejected one is never revived.
 */
const claimableBy = (userId: string) =>
  and(isNull(inactiveMembershipsTable.rejectedAt), or(isNull(inactiveMembershipsTable.userId), eq(inactiveMembershipsTable.userId, userId)));

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

/**
 * Binds every unbound, {@link claimableBy claimable} invitation addressed to `email` and returns the ids it bound. The
 * caller has proven that inbox. An invitation already bound to the user is left out, so the link flow that bound it
 * keeps its token.
 */
export const bindInactiveMembershipsByEmail = async (ctx: DbContext, { email, userId }: BindInactiveMembershipsByEmailOpts) => {
  const { db } = ctx.var;
  const bound = await db
    .update(inactiveMembershipsTable)
    .set({ userId })
    .where(and(eq(inactiveMembershipsTable.email, email), isNull(inactiveMembershipsTable.userId), claimableBy(userId)))
    .returning({ id: inactiveMembershipsTable.id });
  return bound.map((row) => row.id);
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

  const searchFilters = q ? [textSearchFilter(usersTable.name, q), textSearchFilter(usersTable.email, q)] : [];

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
    .where(and(...membersFilters, or(...searchFilters)));

  const itemsQuery = membersQuery
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset);

  // Totals count over a slim id-only query, so include=counts never evaluates its subqueries channel-wide
  const totalQuery = db
    .select({ id: usersTable.id })
    .from(usersTable)
    .innerJoin(membershipsTable, eq(membershipsTable.userId, usersTable.id))
    .where(and(...membersFilters, or(...searchFilters)));

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

interface FindPendingMembershipsPaginatedOpts {
  organizationId: string;
  entityId: string;
  sort?: 'createdAt';
  order?: 'asc' | 'desc';
  offset: number;
  limit: number;
}

/**
 * A channel's pending invitations as the inviter sees them: the address each went to, never the account that may hold
 * it, so a row looks the same whether the invitee already has an account or not.
 */
export const findPendingMembershipsPaginated = async (ctx: DbContext, opts: FindPendingMembershipsPaginatedOpts) => {
  const { db } = ctx.var;
  const { organizationId, entityId, sort, order, offset, limit } = opts;

  const table = inactiveMembershipsTable;
  const orderBy = getOrderColumns({ sort, order, fallback: ['createdAt', 'desc'], columns: { createdAt: table.createdAt }, tieBreaker: table.id });

  const pendingMembershipsQuery = db
    .select({
      id: table.id,
      role: table.role,
      email: table.email,
      createdAt: table.createdAt,
      remindedAt: table.remindedAt,
      createdBy: table.createdBy,
    })
    .from(table)
    .where(and(eq(table.channelId, entityId), eq(table.organizationId, organizationId), isNull(table.rejectedAt)));

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

/** Every membership of these users, in any organization. */
export const findMembershipsByUserIds = async (ctx: DbContext, { userIds }: FindMembershipsByUserIdsOpts) => {
  return ctx.var.db.select().from(membershipsTable).where(inArray(membershipsTable.userId, userIds));
};

interface InactiveMembershipIdOpts {
  id: string;
}

/** Deletes an inactive membership by id. */
export const deleteInactiveMembership = async (ctx: DbContext, { id }: InactiveMembershipIdOpts) => {
  await ctx.var.db.delete(inactiveMembershipsTable).where(eq(inactiveMembershipsTable.id, id));
};

interface UpdateInactiveMembershipsOpts {
  ids: string[];
  values: { role?: EntityRole; rejectedAt?: null; remindedAt?: string | null };
}

/** Invitations sent again: a declined one opens again, a higher role replaces a lower one, the last email moves. */
export const updateInactiveMemberships = async (ctx: DbContext, { ids, values }: UpdateInactiveMembershipsOpts) => {
  if (!ids.length) return;
  await ctx.var.db.update(inactiveMembershipsTable).set(values).where(inArray(inactiveMembershipsTable.id, ids));
};

/** Stamps an inactive membership rejected now. */
export const stampInactiveMembershipRejected = async (ctx: DbContext, { id }: InactiveMembershipIdOpts) => {
  await ctx.var.db.update(inactiveMembershipsTable).set({ rejectedAt: getIsoDate() }).where(eq(inactiveMembershipsTable.id, id));
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
