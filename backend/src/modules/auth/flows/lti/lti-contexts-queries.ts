import { and, count, eq, getColumns, inArray } from 'drizzle-orm';
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

/** The row of a connection's LTI context; undefined before a launch mapped it. */
export const findLtiContext = async (ctx: DbContext, { connectionId, contextId }: { connectionId: string; contextId: string }) => {
  const [row] = await ctx.var.db
    .select()
    .from(ltiContextsTable)
    .where(and(eq(ltiContextsTable.connectionId, connectionId), eq(ltiContextsTable.contextId, contextId)))
    .limit(1);
  return row;
};

/** An LTI context row by its own id; undefined once its connection or channel went. */
export const findLtiContextById = async (ctx: DbContext, { id }: { id: string }) => {
  const [row] = await ctx.var.db.select().from(ltiContextsTable).where(eq(ltiContextsTable.id, id)).limit(1);
  return row;
};

/**
 * Records an LTI context and the channel it maps to, or takes the label, title and types of a context recorded before,
 * written by `by`; the row as stored. A recorded context keeps its channel: compare it with the one given. The
 * membership address changes only when `values` names one: a launch without it clears nothing.
 */
export const upsertLtiContext = async (ctx: DbContext, { values, by }: { values: Omit<InsertLtiContextModel, 'createdBy'>; by: UserId }) => {
  const { label, title, types, membershipsUrl } = values;
  const [row] = await ctx.var.db
    .insert(ltiContextsTable)
    .values({ ...values, createdBy: by })
    .onConflictDoUpdate({
      target: [ltiContextsTable.connectionId, ltiContextsTable.contextId],
      set: { label, title, types, ...(membershipsUrl && { membershipsUrl }), ...updateStamps(by) },
    })
    .returning();
  return row;
};

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
