import { and, count, countDistinct, eq, inArray, isNull, notExists, notInArray, or } from 'drizzle-orm';
import type { EntityRole } from 'shared';
import type { DbContext, OrgContext, UserContext } from '#/core/context';
import { resolveListTotal } from '#/db/utils/list-total';
import { inactiveMembershipsTable } from '#/modules/memberships/inactive-memberships-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { getIsoDate } from '#/utils/iso-date';
import { getOrderColumns } from '#/utils/order-column';

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

interface FindPendingOrganizationInactiveMembershipOpts {
  email: string;
  organizationId: string;
}

/** An invitation to the address into the organization itself that stands, not rejected: it names the role a sign-in must not pre-empt. */
export const findPendingOrganizationInactiveMembership = async (
  ctx: DbContext,
  { email, organizationId }: FindPendingOrganizationInactiveMembershipOpts,
) => {
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
