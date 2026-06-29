import { and, count, eq, inArray } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import { contextCountersTable } from '#/modules/entities/context-counters-db';
import { seenByTable } from '#/modules/seen/seen-by-db';

interface FindContextCountersOpts {
  contextIds: string[];
}

/** Fetch context counter rows for the given context IDs (no RLS). */
export const findContextCounters = async (ctx: DbContext, { contextIds }: FindContextCountersOpts) => {
  const { db } = ctx.var;
  return db
    .select({
      contextKey: contextCountersTable.contextKey,
      counts: contextCountersTable.counts,
    })
    .from(contextCountersTable)
    .where(inArray(contextCountersTable.contextKey, contextIds));
};

interface FindSeenCountsByUserOpts {
  userId: string;
  contextIds: string[];
}

/** Fetch user's seen counts grouped by contextId + entityType (no RLS). */
export const findSeenCountsByUser = async (ctx: DbContext, { userId, contextIds }: FindSeenCountsByUserOpts) => {
  const { db } = ctx.var;
  return db
    .select({
      contextId: seenByTable.contextId,
      entityType: seenByTable.entityType,
      seenCount: count(),
    })
    .from(seenByTable)
    .where(and(eq(seenByTable.userId, userId), inArray(seenByTable.contextId, contextIds)))
    .groupBy(seenByTable.contextId, seenByTable.entityType);
};
