import type { z } from '@hono/zod-openapi';
import { and, count, countDistinct, eq, getColumns, inArray, isNull, ne, notExists, notInArray, or, sql } from 'drizzle-orm';
import { appConfig } from 'shared';
import type { DbContext, OrgContext } from '#/core/context';
import type { UserId } from '#/db/utils/ids';
import { exactTotal, resolveListTotal } from '#/db/utils/list-total';
import { updateStamps } from '#/db/utils/stamps';
import { type InvitationStatus, invitationsTable } from '#/modules/memberships/invitations-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import type { pendingMembershipListQuerySchema } from '#/modules/memberships/memberships-schema';
import { organizationsTable } from '#/modules/organization/organization-db';
import { channelBaseSchema } from '#/schemas/entity-base';
import { getEntityTable } from '#/tables';
import { getIsoDate } from '#/utils/iso-date';
import { getOrderColumns } from '#/utils/order-column';
import { pick } from '#/utils/pick';

/** The values of a status write: `statusChangedAt` moves only when the row's status does. */
const statusValues = (status: InvitationStatus, at: string) => ({
  status,
  statusChangedAt: sql<string>`CASE WHEN ${invitationsTable.status} = ${status} THEN ${invitationsTable.statusChangedAt} ELSE ${at} END`,
});

interface CountInvitationSeatsOpts {
  organizationId: string;
  /** Addresses the caller charges a seat for itself; their invitations are not counted again. */
  exceptEmails?: string[];
}

/**
 * The organization's seats its invitations hold: each address with a held or pending invitation, to the organization
 * or to any channel below it, counted once, since accepting either makes an organization member. An invitation bound
 * to an account that is a member already, or a declined one, holds none.
 */
export const countInvitationSeats = async (ctx: DbContext, { organizationId, exceptEmails = [] }: CountInvitationSeatsOpts) => {
  const { db } = ctx.var;
  const orgMembership = db
    .select({ id: membershipsTable.id })
    .from(membershipsTable)
    .where(
      and(
        eq(membershipsTable.userId, invitationsTable.userId),
        eq(membershipsTable.channelType, 'organization'),
        eq(membershipsTable.channelId, organizationId),
      ),
    );
  const [{ seats }] = await db
    .select({ seats: countDistinct(invitationsTable.email) })
    .from(invitationsTable)
    .where(
      and(
        eq(invitationsTable.organizationId, organizationId),
        ne(invitationsTable.status, 'declined'),
        notExists(orgMembership),
        exceptEmails.length ? notInArray(invitationsTable.email, exceptEmails) : undefined,
      ),
    );
  return seats;
};

/** The channel's invitations addressed to exactly these addresses, in any status. */
export const findInvitationsByEmails = async (ctx: DbContext, { emails, channelId }: { emails: string[]; channelId: string }) => {
  if (!emails.length) return [];
  return ctx.var.db
    .select(pick(invitationsTable, ['id', 'email', 'userId', 'role', 'status', 'declinedAt', 'createdAt']))
    .from(invitationsTable)
    .where(and(eq(invitationsTable.channelId, channelId), inArray(invitationsTable.email, emails)));
};

/** Moves the held invitations of these channels to pending, for their publish to mail, and returns them. */
export const releaseHeldInvitations = async (ctx: DbContext, { channelIds, by }: { channelIds: string[]; by: UserId }) => {
  if (!channelIds.length) return [];
  const at = getIsoDate();
  return ctx.var.db
    .update(invitationsTable)
    .set({ ...statusValues('pending', at), ...updateStamps(by, at) })
    .where(and(inArray(invitationsTable.channelId, channelIds), eq(invitationsTable.status, 'held')))
    .returning({ id: invitationsTable.id, email: invitationsTable.email });
};

/** Stamps `mailedAt` on the invitations whose mail just went out: a first mail, a resend or a publish's. */
export const stampInvitationsMailed = async (ctx: DbContext, { ids, by }: { ids: string[]; by: UserId }) => {
  if (!ids.length) return;
  const at = getIsoDate();
  await ctx.var.db
    .update(invitationsTable)
    .set({ mailedAt: at, ...updateStamps(by, at) })
    .where(inArray(invitationsTable.id, ids));
};

interface FindPendingInvitationOpts {
  id: string;
  /** Lock the row for the caller's transaction, so a concurrent answer, decline or resend waits for it. */
  forUpdate?: boolean;
}

/** A pending invitation by id. */
export const findPendingInvitation = async (ctx: DbContext, { id, forUpdate = false }: FindPendingInvitationOpts) => {
  const query = ctx.var.db
    .select()
    .from(invitationsTable)
    .where(and(eq(invitationsTable.id, id), eq(invitationsTable.status, 'pending')));
  const [invitation] = forUpdate ? await query.for('update') : await query;
  return invitation;
};

/**
 * The pending invitations among `ids`, locked for the caller's transaction in id order: a concurrent answer, decline
 * or resend waits for it, and two batches over the same rows never deadlock.
 */
export const lockPendingInvitations = async (ctx: DbContext, { ids }: { ids: string[] }) => {
  if (!ids.length) return [];
  return ctx.var.db
    .select()
    .from(invitationsTable)
    .where(and(inArray(invitationsTable.id, ids), eq(invitationsTable.status, 'pending')))
    .orderBy(invitationsTable.id)
    .for('update');
};

/** A held or pending invitation to the address; undefined when none stands. */
export const findOpenInvitationByEmail = async (ctx: DbContext, { email }: { email: string }) => {
  const [invitation] = await ctx.var.db
    .select({ id: invitationsTable.id })
    .from(invitationsTable)
    .where(and(eq(invitationsTable.email, email), ne(invitationsTable.status, 'declined')))
    .limit(1);
  return invitation;
};

/** A held or pending invitation to the address into the organization itself: it names the role a sign-in must not pre-empt. */
export const findOpenOrganizationInvitation = async (ctx: DbContext, { email, organizationId }: { email: string; organizationId: string }) => {
  const [invitation] = await ctx.var.db
    .select({ id: invitationsTable.id })
    .from(invitationsTable)
    .where(
      and(
        eq(invitationsTable.email, email),
        eq(invitationsTable.channelType, 'organization'),
        eq(invitationsTable.channelId, organizationId),
        ne(invitationsTable.status, 'declined'),
      ),
    )
    .limit(1);
  return invitation;
};

/** Inserts invitations and returns the ones inserted; a row whose address the channel invited already is skipped. */
export const insertInvitations = async (ctx: DbContext, { invitations }: { invitations: (typeof invitationsTable.$inferInsert)[] }) => {
  if (!invitations.length) return [];
  return ctx.var.db
    .insert(invitationsTable)
    .values(invitations)
    .onConflictDoNothing()
    .returning({ id: invitationsTable.id, email: invitationsTable.email });
};

/** An invitation by id, of any organization, in any status. */
export const findInvitationById = async (ctx: DbContext, { id }: { id: string }) => {
  const [invitation] = await ctx.var.db.select().from(invitationsTable).where(eq(invitationsTable.id, id));
  return invitation;
};

/** An invitation of the request's organization by id, in any status; one of another organization reads as missing. */
export const findInvitationInOrg = async (ctx: OrgContext, { id }: { id: string }) => {
  const { db, organizationId } = ctx.var;
  const [invitation] = await db
    .select()
    .from(invitationsTable)
    .where(and(eq(invitationsTable.id, id), eq(invitationsTable.organizationId, organizationId)));
  return invitation;
};

interface FindInvitationForUserOpts {
  id: string;
  userId: string;
}

/** Id path: a pending invitation bound to this user; a held one waits for its publish, a declined one is answered. */
export const findPendingInvitationForUser = async (ctx: DbContext, { id, userId }: FindInvitationForUserOpts) => {
  const [invitation] = await ctx.var.db
    .select()
    .from(invitationsTable)
    .where(and(eq(invitationsTable.id, id), eq(invitationsTable.userId, userId), eq(invitationsTable.status, 'pending')))
    .limit(1);
  return invitation;
};

/**
 * An invitation is claimable by a user while it is not declined and unbound, or bound to that same user. Every write
 * that binds an invitation goes through this condition, so a row bound to someone else is never re-bound
 * (GHSA-fmh4-wcc4-5jm3) and a declined one is never revived.
 */
const claimableBy = (userId: string) =>
  and(ne(invitationsTable.status, 'declined'), or(isNull(invitationsTable.userId), eq(invitationsTable.userId, userId)));

/** Token path: the invitation is answerable by this user while it is pending and {@link claimableBy} holds. */
export const findClaimableInvitation = async (ctx: DbContext, { id, userId }: FindInvitationForUserOpts) => {
  const [invitation] = await ctx.var.db
    .select()
    .from(invitationsTable)
    .where(and(eq(invitationsTable.id, id), eq(invitationsTable.status, 'pending'), claimableBy(userId)))
    .limit(1);
  return invitation;
};

/** Binds claimable invitations to the user and returns the ids it bound; an id missing from the result lost a race or belongs to someone else. */
export const bindInvitations = async (ctx: DbContext, { ids, userId }: { ids: string[]; userId: UserId }) => {
  if (!ids.length) return [];
  const bound = await ctx.var.db
    .update(invitationsTable)
    .set({ userId, ...updateStamps(userId) })
    .where(and(inArray(invitationsTable.id, ids), claimableBy(userId)))
    .returning({ id: invitationsTable.id });
  return bound.map((row) => row.id);
};

/**
 * Binds every unbound, {@link claimableBy claimable} invitation addressed to `email` and returns the ids it bound. The
 * caller has proven that inbox. An invitation already bound to the user is left out, so the link flow that bound it
 * keeps its token.
 */
export const bindInvitationsByEmail = async (ctx: DbContext, { email, userId }: { email: string; userId: UserId }) => {
  const bound = await ctx.var.db
    .update(invitationsTable)
    .set({ userId, ...updateStamps(userId) })
    .where(and(eq(invitationsTable.email, email), isNull(invitationsTable.userId), claimableBy(userId)))
    .returning({ id: invitationsTable.id });
  return bound.map((row) => row.id);
};

interface FindInvitationsPaginatedOpts extends Pick<z.infer<typeof pendingMembershipListQuerySchema>['orderBy'], 'sort' | 'order'> {
  organizationId: string;
  entityId: string;
  offset: number;
  limit: number;
}

/**
 * A channel's held and pending invitations as the inviter sees them: the address each went to, never the account
 * that may hold it, so a row looks the same whether the invitee already has an account or not.
 */
export const findInvitationsPaginated = async (ctx: DbContext, opts: FindInvitationsPaginatedOpts) => {
  const { db } = ctx.var;
  const { organizationId, entityId, sort, order, offset, limit } = opts;

  const table = invitationsTable;
  const orderBy = getOrderColumns({ sort, order, columns: { createdAt: table.createdAt }, tieBreaker: table.id });

  const where = and(eq(table.channelId, entityId), eq(table.organizationId, organizationId), ne(table.status, 'declined'));

  const itemsQuery = db
    .select(pick(table, ['id', 'role', 'email', 'status', 'createdAt', 'mailedAt', 'createdBy']))
    .from(table)
    .where(where)
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset);

  return resolveListTotal(itemsQuery, exactTotal(db.select({ total: count() }).from(table).where(where)));
};

/** Deletes invitations by id; their tokens go with them. */
export const deleteInvitations = async (ctx: DbContext, { ids }: { ids: string[] }) => {
  if (!ids.length) return;
  await ctx.var.db.delete(invitationsTable).where(inArray(invitationsTable.id, ids));
};

/** Declines a pending invitation as its invitee. */
export const declineInvitation = async (ctx: DbContext, { id, userId }: { id: string; userId: UserId }) => {
  const at = getIsoDate();
  await ctx.var.db
    .update(invitationsTable)
    .set({ ...statusValues('declined', at), declinedAt: at, ...updateStamps(userId, at) })
    .where(and(eq(invitationsTable.id, id), eq(invitationsTable.status, 'pending')));
};

/**
 * The user's pending invitations, each with its channel's base columns and, for a channel below the organization, the
 * organization's name. A held one stays hidden until its channel's publish releases it.
 */
export const findPendingInvitationsByUser = async (ctx: DbContext, { userId }: { userId: string }) => {
  const results = await Promise.all(
    appConfig.channelEntityTypes.map(async (channelType) => {
      const channelTable = getEntityTable(channelType);
      const channelBaseSelect = pick(getColumns(channelTable), channelBaseSchema.keyof().options);
      const isOrganization = channelType === 'organization';

      const query = ctx.var.db
        .select({ entity: channelBaseSelect, inactiveMembership: invitationsTable, organizationName: organizationsTable.name })
        .from(invitationsTable)
        .innerJoin(channelTable, eq(channelTable.id, invitationsTable.channelId))
        .$dynamic();
      // An organization invitation joins the organizations table as its channel table and carries no organization name.
      const joined = isOrganization ? query : query.innerJoin(organizationsTable, eq(organizationsTable.id, invitationsTable.organizationId));

      const rows = await joined.where(
        and(eq(invitationsTable.channelType, channelType), eq(invitationsTable.userId, userId), eq(invitationsTable.status, 'pending')),
      );
      return rows.map((row) => ({ ...row, organizationName: isOrganization ? null : row.organizationName }));
    }),
  );

  return results.flat();
};
