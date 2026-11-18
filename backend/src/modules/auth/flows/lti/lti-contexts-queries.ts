import { and, eq } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import type { UserId } from '#/db/utils/ids';
import { updateStamps } from '#/db/utils/stamps';
import { type InsertLtiContextModel, ltiContextsTable } from '#/modules/auth/flows/lti/lti-contexts-db';

/** The row of a connection's LTI context; undefined before a launch mapped it. */
export const findLtiContext = async (ctx: DbContext, { connectionId, contextId }: { connectionId: string; contextId: string }) => {
  const [row] = await ctx.var.db
    .select()
    .from(ltiContextsTable)
    .where(and(eq(ltiContextsTable.connectionId, connectionId), eq(ltiContextsTable.contextId, contextId)))
    .limit(1);
  return row;
};

/**
 * Records an LTI context and the channel it maps to, or takes the label, title and types of a context recorded before,
 * written by `by`; the row as stored. A recorded context keeps its channel: compare it with the one given.
 */
export const upsertLtiContext = async (ctx: DbContext, { values, by }: { values: Omit<InsertLtiContextModel, 'createdBy'>; by: UserId }) => {
  const { label, title, types } = values;
  const [row] = await ctx.var.db
    .insert(ltiContextsTable)
    .values({ ...values, createdBy: by })
    .onConflictDoUpdate({
      target: [ltiContextsTable.connectionId, ltiContextsTable.contextId],
      set: { label, title, types, ...updateStamps(by) },
    })
    .returning();
  return row;
};
