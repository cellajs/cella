import { and, count, eq, getColumns, gt, inArray } from 'drizzle-orm';
import { appConfig } from 'shared';
import type { DbContext } from '#/core/context';
import type { ActorId, UserId } from '#/db/utils/ids';
import { exactTotal, resolveListTotal } from '#/db/utils/list-total';
import { updateStamps } from '#/db/utils/stamps';
import { type InsertLtiContextModel, type LtiImportIssue, ltiContextsTable } from '#/modules/auth/flows/lti/lti-contexts-db';
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
 * Records an LTI context and the channel it maps to, or takes over a context recorded before for the connection in
 * `values`, with its label, title and types, written by `by`; the row as stored. A recorded context keeps its channel:
 * compare it with the one given. The membership address changes when `values` names it, null included: undefined
 * keeps it.
 */
export const upsertLtiContext = async (ctx: DbContext, { values, by }: { values: Omit<InsertLtiContextModel, 'createdBy'>; by: UserId }) => {
  const { connectionId, label, title, types, membershipsUrl } = values;
  const [row] = await ctx.var.db
    .insert(ltiContextsTable)
    .values({ ...values, createdBy: by })
    .onConflictDoUpdate({
      target: [ltiContextsTable.tenantId, ltiContextsTable.issuer, ltiContextsTable.contextId],
      set: { connectionId, label, title, types, ...(membershipsUrl !== undefined && { membershipsUrl }), ...updateStamps(by) },
    })
    .returning();
  return row;
};

/** How many courses of a connection a member import read since `since`. */
export const countLtiImportsSince = (ctx: DbContext, { connectionId, since }: { connectionId: string; since: string }) =>
  ctx.var.db.$count(ltiContextsTable, and(eq(ltiContextsTable.connectionId, connectionId), gt(ltiContextsTable.importRanAt, since)));

interface RecordLtiImportOpts {
  id: string;
  readCount: number;
  issue: LtiImportIssue | null;
  /** The connection's service account, which the import writes as. */
  by: ActorId;
}

/** Records how the member import of a context ran: now, the people it read and why it stopped short, if it did. */
export const recordLtiImport = async (ctx: DbContext, { id, readCount, issue, by }: RecordLtiImportOpts) => {
  const at = getIsoDate();
  await ctx.var.db
    .update(ltiContextsTable)
    .set({ importRanAt: at, importReadCount: readCount, importIssue: issue, ...updateStamps(by, at) })
    .where(eq(ltiContextsTable.id, id));
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
