import type { z } from '@hono/zod-openapi';
import { and, count, countDistinct, eq, getColumns, inArray, isNotNull, isNull, notExists, notInArray, or } from 'drizzle-orm';
import { appConfig, type EntityRole, hierarchy } from 'shared';
import type { DbContext, OrgContext } from '#/core/context';
import { exactTotal, resolveListTotal } from '#/db/utils/list-total';
import { inactiveMembershipsTable } from '#/modules/memberships/inactive-memberships-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import type { pendingMembershipListQuerySchema } from '#/modules/memberships/memberships-schema';
import { organizationsTable } from '#/modules/organization/organization-db';
import { channelBaseSchema } from '#/schemas/entity-base';
import { getEntityTable } from '#/tables';
import { getIsoDate } from '#/utils/iso-date';
import { getOrderColumns } from '#/utils/order-column';
import { pick } from '#/utils/pick';

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

/** The channel's inactive memberships addressed to exactly these addresses, pending or rejected. */
export const findInactiveMembershipsByEmails = async (ctx: DbContext, { emails, channelId }: { emails: string[]; channelId: string }) => {
  if (!emails.length) return [];
  return ctx.var.db
    .select(pick(inactiveMembershipsTable, ['id', 'email', 'userId', 'role', 'rejectedAt', 'createdAt', 'remindedAt']))
    .from(inactiveMembershipsTable)
    .where(and(eq(inactiveMembershipsTable.channelId, channelId), inArray(inactiveMembershipsTable.email, emails)));
};

/** Pending (not rejected) inactive memberships of a set of channels. */
export const findPendingInactiveMembershipsByChannels = async (ctx: DbContext, { channelIds }: { channelIds: string[] }) => {
  if (!channelIds.length) return [];
  return ctx.var.db
    .select()
    .from(inactiveMembershipsTable)
    .where(and(inArray(inactiveMembershipsTable.channelId, channelIds), isNull(inactiveMembershipsTable.rejectedAt)));
};

/** Stamps `remindedAt` on the invitations whose mail just went out: a first mail, a reminder, a resend or a dispatch. */
export const stampInactiveMembershipsReminded = async (ctx: DbContext, { ids, remindedAt }: { ids: string[]; remindedAt: string }) => {
  if (!ids.length) return;
  return ctx.var.db.update(inactiveMembershipsTable).set({ remindedAt }).where(inArray(inactiveMembershipsTable.id, ids));
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

/**
 * The pending (not rejected) invitations among `ids`, locked for the caller's transaction in id order: a concurrent
 * answer, rejection or resend waits for it, and two batches over the same rows never deadlock.
 */
export const lockPendingInactiveMemberships = async (ctx: DbContext, { ids }: { ids: string[] }) => {
  if (!ids.length) return [];
  return ctx.var.db
    .select()
    .from(inactiveMembershipsTable)
    .where(and(inArray(inactiveMembershipsTable.id, ids), isNull(inactiveMembershipsTable.rejectedAt)))
    .orderBy(inactiveMembershipsTable.id)
    .for('update');
};

/** A membership invitation to the address that stands, not rejected; undefined when none does. */
export const findPendingInactiveMembershipByEmail = async (ctx: DbContext, { email }: { email: string }) => {
  const [invitation] = await ctx.var.db
    .select({ id: inactiveMembershipsTable.id })
    .from(inactiveMembershipsTable)
    .where(and(eq(inactiveMembershipsTable.email, email), isNull(inactiveMembershipsTable.rejectedAt)))
    .limit(1);
  return invitation;
};

/** An invitation to the address into the organization itself that stands, not rejected: it names the role a sign-in must not pre-empt. */
export const findPendingOrganizationInactiveMembership = async (
  ctx: DbContext,
  { email, organizationId }: { email: string; organizationId: string },
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
  if (!memberships.length) return [];
  return ctx.var.db
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
  const [membership] = await ctx.var.db.select().from(inactiveMembershipsTable).where(eq(inactiveMembershipsTable.id, id));
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
  userId: string;
}

/** Id path: a pending invitation bound to this user; a rejected one is answered and stays so. */
export const findInactiveMembershipForUser = async (ctx: DbContext, { id, userId }: FindInactiveMembershipForUserOpts) => {
  const [membership] = await ctx.var.db
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
export const findClaimableInactiveMembership = async (ctx: DbContext, { id, userId }: FindInactiveMembershipForUserOpts) => {
  const [membership] = await ctx.var.db
    .select()
    .from(inactiveMembershipsTable)
    .where(and(eq(inactiveMembershipsTable.id, id), claimableBy(userId)))
    .limit(1);
  return membership;
};

/** Binds claimable invitations to the user and returns the ids it bound; an id missing from the result lost a race or belongs to someone else. */
export const bindInactiveMemberships = async (ctx: DbContext, { ids, userId }: { ids: string[]; userId: string }) => {
  if (!ids.length) return [];
  const bound = await ctx.var.db
    .update(inactiveMembershipsTable)
    .set({ userId })
    .where(and(inArray(inactiveMembershipsTable.id, ids), claimableBy(userId)))
    .returning({ id: inactiveMembershipsTable.id });
  return bound.map((row) => row.id);
};

/**
 * Binds every unbound, {@link claimableBy claimable} invitation addressed to `email` and returns the ids it bound. The
 * caller has proven that inbox. An invitation already bound to the user is left out, so the link flow that bound it
 * keeps its token.
 */
export const bindInactiveMembershipsByEmail = async (ctx: DbContext, { email, userId }: { email: string; userId: string }) => {
  const bound = await ctx.var.db
    .update(inactiveMembershipsTable)
    .set({ userId })
    .where(and(eq(inactiveMembershipsTable.email, email), isNull(inactiveMembershipsTable.userId), claimableBy(userId)))
    .returning({ id: inactiveMembershipsTable.id });
  return bound.map((row) => row.id);
};

interface FindPendingMembershipsPaginatedOpts extends Pick<z.infer<typeof pendingMembershipListQuerySchema>['orderBy'], 'sort' | 'order'> {
  organizationId: string;
  entityId: string;
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
  const orderBy = getOrderColumns({ sort, order, columns: { createdAt: table.createdAt }, tieBreaker: table.id });

  const where = and(eq(table.channelId, entityId), eq(table.organizationId, organizationId), isNull(table.rejectedAt));

  const itemsQuery = db
    .select(pick(table, ['id', 'role', 'email', 'createdAt', 'remindedAt', 'createdBy']))
    .from(table)
    .where(where)
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset);

  return resolveListTotal(itemsQuery, exactTotal(db.select({ total: count() }).from(table).where(where)));
};

interface InactiveMembershipIdOpts {
  id: string;
}

/** Deletes an inactive membership by id; its tokens go with it. */
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

/**
 * The user's open invitations: inactive memberships not rejected, each with its channel's base columns and, for a
 * channel below the organization, the organization's name.
 */
export const findPendingInactiveMembershipsByUser = async (ctx: DbContext, { userId }: { userId: string }) => {
  const results = await Promise.all(
    appConfig.channelEntityTypes.map(async (channelType) => {
      const channelTable = getEntityTable(channelType);
      const cols = getColumns(channelTable);
      const channelBaseSelect = pick(cols, channelBaseSchema.keyof().options);
      const prepareRoles = hierarchy.getPrepareRoles(channelType);
      const isOrganization = channelType === 'organization';

      const query = ctx.var.db
        .select({ entity: channelBaseSelect, inactiveMembership: inactiveMembershipsTable, organizationName: organizationsTable.name })
        .from(inactiveMembershipsTable)
        .innerJoin(channelTable, eq(channelTable.id, inactiveMembershipsTable.channelId))
        .$dynamic();
      // An organization invitation joins the organizations table as its channel table and carries no organization name.
      const joined = isOrganization ? query : query.innerJoin(organizationsTable, eq(organizationsTable.id, inactiveMembershipsTable.organizationId));

      const rows = await joined.where(
        and(
          eq(inactiveMembershipsTable.channelType, channelType),
          eq(inactiveMembershipsTable.userId, userId),
          isNull(inactiveMembershipsTable.rejectedAt),
          // An invitation to an unpublished channel stays hidden until it is published, except one for a prepare role:
          // its email went out at once, so the invitee must be able to answer it.
          or(isNotNull(cols.publishedAt), prepareRoles.length ? inArray(inactiveMembershipsTable.role, prepareRoles) : undefined),
        ),
      );
      return rows.map((row) => ({ ...row, organizationName: isOrganization ? null : row.organizationName }));
    }),
  );

  return results.flat();
};
