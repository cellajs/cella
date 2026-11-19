import { and, eq } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import type { ActorId, UserId } from '#/db/utils/ids';
import { updateStamps } from '#/db/utils/stamps';
import { type InsertLtiContextModel, type LtiImportIssue, ltiContextsTable } from '#/modules/auth/flows/lti/lti-contexts-db';
import { getIsoDate } from '#/utils/iso-date';

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
 * written by `by`; the row as stored. A recorded context keeps its channel: compare it with the one given. The API
 * addresses change only when `values` names them: a launch without them clears nothing.
 */
export const upsertLtiContext = async (ctx: DbContext, { values, by }: { values: Omit<InsertLtiContextModel, 'createdBy'>; by: UserId }) => {
  const { label, title, types, apiUrl, membersUrl } = values;
  const [row] = await ctx.var.db
    .insert(ltiContextsTable)
    .values({ ...values, createdBy: by })
    .onConflictDoUpdate({
      target: [ltiContextsTable.connectionId, ltiContextsTable.contextId],
      set: { label, title, types, ...(apiUrl && membersUrl && { apiUrl, membersUrl }), ...updateStamps(by) },
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
