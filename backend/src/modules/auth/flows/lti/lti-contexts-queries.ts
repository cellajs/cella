import { and, count, eq, getColumns, gt, inArray, isNull, notInArray, or, sql } from 'drizzle-orm';
import { appConfig } from 'shared';
import type { DbContext } from '#/core/context';
import type { ActorId, UserId } from '#/db/utils/ids';
import { exactTotal, resolveListTotal } from '#/db/utils/list-total';
import { updateStamps } from '#/db/utils/stamps';
import {
  type InsertLtiContextModel,
  type LtiContextModel,
  type LtiImportIssue,
  ltiContextMembershipsTable,
  ltiContextsTable,
} from '#/modules/auth/flows/lti/lti-contexts-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { identitiesTable } from '#/modules/user/identities-db';
import type { OrderDirection } from '#/schemas/common-schemas';
import { channelBaseSchema } from '#/schemas/entity-base';
import { getEntityTable } from '#/tables';
import { getIsoDate } from '#/utils/iso-date';
import { getOrderColumns } from '#/utils/order-column';
import { pick } from '#/utils/pick';

interface LtiContextKey {
  tenantId: string;
  issuer: string;
  contextId: string;
}

/** The row of a platform's LTI context in a tenant, whichever connection launched it; undefined before a launch mapped it. */
export const findLtiContext = async (ctx: DbContext, { tenantId, issuer, contextId }: LtiContextKey) => {
  const [row] = await ctx.var.db
    .select()
    .from(ltiContextsTable)
    .where(and(eq(ltiContextsTable.tenantId, tenantId), eq(ltiContextsTable.issuer, issuer), eq(ltiContextsTable.contextId, contextId)))
    .limit(1);
  return row;
};

/** An LTI context row by its own id; undefined once its channel went. */
export const findLtiContextById = async (ctx: DbContext, { id }: { id: string }) => {
  const [row] = await ctx.var.db.select().from(ltiContextsTable).where(eq(ltiContextsTable.id, id)).limit(1);
  return row;
};

/**
 * Records an LTI context and the channel it maps to, with its label, title and types, written by `by`. A recorded
 * context keeps its channel: compare it with the one given. Only the connection that holds the row writes on it, or one
 * that takes over a row whose connection was deleted, with the membership address `values` names, none included. The
 * connection that holds it sets the address `values` names, and undefined keeps it.
 * @returns The row as stored; undefined when another live connection of the tenant and issuer holds it, which leaves
 *   it as it is.
 */
export const upsertLtiContext = async (ctx: DbContext, { values, by }: { values: Omit<InsertLtiContextModel, 'createdBy'>; by: UserId }) => {
  const { connectionId, label, title, types } = values;
  const { connectionId: heldBy, membershipsUrl: heldAddress } = ltiContextsTable;
  const free = sql`${heldBy} IS NULL`;
  const [row] = await ctx.var.db
    .insert(ltiContextsTable)
    .values({ ...values, createdBy: by })
    .onConflictDoUpdate({
      target: [ltiContextsTable.tenantId, ltiContextsTable.issuer, ltiContextsTable.contextId],
      set: {
        connectionId,
        membershipsUrl: sql`CASE WHEN ${free} THEN excluded.memberships_url ELSE coalesce(excluded.memberships_url, ${heldAddress}) END`,
        label,
        title,
        types,
        ...updateStamps(by),
      },
      setWhere: sql`${free} OR ${heldBy} = ${connectionId}`,
    })
    .returning();
  return row;
};

/** A membership a launch or an import of an LTI context gave or found, and whether it made it. */
export interface LtiAdmission {
  id: string;
  created: boolean;
}

/**
 * Records that the context gave these memberships of a person it admits, now, as written by `by`: those it made, and
 * those another context gave. A membership given another way stays unrecorded. Runs under the person's identity lock.
 */
export const recordLtiContextMemberships = async (
  ctx: DbContext,
  { contextId, admissions, by }: { contextId: string; admissions: LtiAdmission[]; by: ActorId },
) => {
  const { membershipId } = ltiContextMembershipsTable;
  const found = admissions.filter(({ created }) => !created).map(({ id }) => id);
  const given = found.length
    ? await ctx.var.db.selectDistinct({ id: membershipId }).from(ltiContextMembershipsTable).where(inArray(membershipId, found))
    : [];
  const ids = [...admissions.filter(({ created }) => created).map(({ id }) => id), ...given.map(({ id }) => id)];
  if (!ids.length) return;
  // The application's clock, which the read that ends a row compares with.
  const at = getIsoDate();
  await ctx.var.db
    .insert(ltiContextMembershipsTable)
    .values(ids.map((id) => ({ contextId, membershipId: id, createdAt: at, createdBy: by })))
    .onConflictDoUpdate({ target: [ltiContextMembershipsTable.contextId, membershipId], set: updateStamps(by, at) });
};

/** When a launch or an import of the context last admitted the person a row names. */
const admittedAt = sql`coalesce(${ltiContextMembershipsTable.updatedAt}, ${ltiContextMembershipsTable.createdAt})`;

/**
 * The people whose memberships the context gave and no launch or import of it admitted since `before`, each once by
 * the subject the context's platform knows them by.
 */
export const findLtiContextPeopleBefore = (
  ctx: DbContext,
  { context, before }: { context: Pick<LtiContextModel, 'id' | 'tenantId' | 'issuer'>; before: string },
) =>
  ctx.var.db
    .selectDistinct({ userId: membershipsTable.userId, subject: identitiesTable.subject })
    .from(ltiContextMembershipsTable)
    .innerJoin(membershipsTable, eq(membershipsTable.id, ltiContextMembershipsTable.membershipId))
    .innerJoin(
      identitiesTable,
      and(
        eq(identitiesTable.userId, membershipsTable.userId),
        eq(identitiesTable.kind, 'lti'),
        eq(identitiesTable.tenantId, context.tenantId),
        eq(identitiesTable.provider, context.issuer),
      ),
    )
    .where(and(eq(ltiContextMembershipsTable.contextId, context.id), sql`${admittedAt} < ${before}`));

/**
 * Ends the record of what the context gave a person, unless a launch or an import of it admitted them since `before`.
 * Runs under the person's identity lock.
 * @returns The ids of the memberships it released that no other context gave: those the person holds by LTI no more.
 */
export const releaseLtiContextMemberships = async (
  ctx: DbContext,
  { contextId, userId, before }: { contextId: string; userId: string; before: string },
) => {
  const { membershipId } = ltiContextMembershipsTable;
  const ofPerson = ctx.var.db.select({ id: membershipsTable.id }).from(membershipsTable).where(eq(membershipsTable.userId, userId));
  const released = await ctx.var.db
    .delete(ltiContextMembershipsTable)
    .where(and(eq(ltiContextMembershipsTable.contextId, contextId), inArray(membershipId, ofPerson), sql`${admittedAt} < ${before}`))
    .returning({ id: membershipId });
  if (!released.length) return [];
  const ids = released.map(({ id }) => id);
  const stillGiven = await ctx.var.db.selectDistinct({ id: membershipId }).from(ltiContextMembershipsTable).where(inArray(membershipId, ids));
  return ids.filter((id) => !stillGiven.some((given) => given.id === id));
};

/** How many contexts of a connection a member import read since `since`. */
export const countLtiImportsSince = (ctx: DbContext, { connectionId, since }: { connectionId: string; since: string }) =>
  ctx.var.db.$count(ltiContextsTable, and(eq(ltiContextsTable.connectionId, connectionId), gt(ltiContextsTable.importRanAt, since)));

interface RecordLtiImportOpts {
  id: string;
  readCount: number;
  issue: LtiImportIssue | null;
  /** True when the platform refused: the membership address goes, until a launch names it again. */
  forgetAddress?: boolean;
  /** The connection's service account, which the import writes as. */
  by: ActorId;
}

/** Records how the member import of a context ran: now, the people it read and why it stopped short, if it did. */
export const recordLtiImport = async (ctx: DbContext, { id, readCount, issue, forgetAddress, by }: RecordLtiImportOpts) => {
  const at = getIsoDate();
  await ctx.var.db
    .update(ltiContextsTable)
    .set({ importRanAt: at, importReadCount: readCount, importIssue: issue, ...(forgetAddress && { membershipsUrl: null }), ...updateStamps(by, at) })
    .where(eq(ltiContextsTable.id, id));
};

/** Refusals a waiting import leaves in place: the platform or the connection has to change before an import reads. */
const lastingIssues: LtiImportIssue[] = ['register_again', 'scope_not_granted', 'members_refused'];

/**
 * Records that a context's member import waits for its connection's hourly budget; the last import's time and count
 * stay, and so does a refusal that lasts (`lastingIssues`).
 */
export const recordLtiImportWaiting = async (ctx: DbContext, { id, by }: { id: string; by: ActorId }) => {
  const { importIssue } = ltiContextsTable;
  await ctx.var.db
    .update(ltiContextsTable)
    .set({ importIssue: 'waiting', ...updateStamps(by) })
    .where(and(eq(ltiContextsTable.id, id), or(isNull(importIssue), notInArray(importIssue, lastingIssues))));
};

interface FindOrganizationLtiContextsOpts {
  tenantId: string;
  organizationId: string;
  /** One connection's contexts; every connection's when omitted. */
  connectionId?: string;
  /** By when a launch first recorded the context. */
  order: OrderDirection;
  offset: number;
  limit: number;
}

/**
 * A page of the LTI contexts mapped to the organization's channels, of one connection of its tenant or of all, each
 * with its channel, and the total.
 */
export async function findOrganizationLtiContexts(
  ctx: DbContext,
  { tenantId, organizationId, connectionId, order, offset, limit }: FindOrganizationLtiContextsOpts,
) {
  const where = and(
    eq(ltiContextsTable.tenantId, tenantId),
    eq(ltiContextsTable.organizationId, organizationId),
    connectionId ? eq(ltiContextsTable.connectionId, connectionId) : undefined,
  );
  const orderBy = getOrderColumns({ sort: 'createdAt', order, columns: { createdAt: ltiContextsTable.createdAt }, tieBreaker: ltiContextsTable.id });
  const itemsQuery = ctx.var.db
    .select()
    .from(ltiContextsTable)
    .where(where)
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset);
  const { items: contexts, total } = await resolveListTotal(
    itemsQuery,
    exactTotal(ctx.var.db.select({ total: count() }).from(ltiContextsTable).where(where)),
  );

  const channels = await Promise.all(
    appConfig.channelEntityTypes.map(async (channelType) => {
      const ids = new Set(contexts.flatMap((context) => (context.channelType === channelType ? [context.channelId] : [])));
      if (!ids.size) return [];
      const table = getEntityTable(channelType);
      return ctx.var.db
        .select(pick(getColumns(table), channelBaseSchema.keyof().options))
        .from(table)
        .where(inArray(table.id, [...ids]));
    }),
  );
  const byId = new Map(channels.flat().map((channel) => [channel.id, channel]));
  // A context goes with its channel, so each finds one; the total counts them alike.
  const items = contexts.flatMap((context) => {
    const channel = byId.get(context.channelId);
    return channel ? [{ context, channel }] : [];
  });
  return { items, total };
}
