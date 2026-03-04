import { sql } from 'drizzle-orm';
import { contextCountersTable } from '#/db/schema/context-counters';
import { cdcDb } from '../db';
import type { SeqScope } from './get-seq-scope';

/**
 * Get the next sequence number for an activity scope.
 * All sequences are stored in contextCountersTable (org-scoped and public).
 * Uses atomic upsert: INSERT ... ON CONFLICT DO UPDATE.
 *
 * For org-scoped product entities, also increments a per-entityType seq
 * in the counts JSONB column (key: 's:{entityType}'), enabling granular
 * catchup and prefetch skip decisions per entity type within an org.
 *
 * @param scope - Typed scope from getSeqScope()
 * @returns The next sequence number
 */
export async function getNextSeq(scope: SeqScope): Promise<number> {
  const col = scope.column === 'mSeq' ? contextCountersTable.mSeq : contextCountersTable.seq;

  // Build the SET clause — always increment the top-level seq/mSeq column
  // For org-scoped product entities, also increment counts['s:{entityType}'] atomically
  const entitySeqExpr = scope.entityType
    ? sql`${contextCountersTable.counts} || jsonb_build_object(${sql.raw(`'s:${scope.entityType}'`)}, COALESCE((${contextCountersTable.counts}->>${sql.raw(`'s:${scope.entityType}'`)})::int, 0) + 1)`
    : undefined;

  const setClause: Record<string, unknown> = {
    [scope.column]: sql`${col} + 1`,
    updatedAt: new Date(),
  };
  if (entitySeqExpr) {
    setClause.counts = entitySeqExpr;
  }

  // Build initial counts for INSERT (new row case)
  const initialCounts = scope.entityType ? { [`s:${scope.entityType}`]: 1 } : {};

  const result = await cdcDb
    .insert(contextCountersTable)
    .values({
      contextKey: scope.contextKey,
      [scope.column]: 1,
      counts: initialCounts,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: contextCountersTable.contextKey,
      set: setClause,
    })
    .returning({ value: col });

  return result[0].value;
}
