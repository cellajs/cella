import { sql } from 'drizzle-orm';
import { contextCountersTable } from '#/db/schema/context-counters';
import { cdcDb } from '../db';
import type { SeqScope } from './get-seq-scope';

/**
 * Get the next sequence number for an activity scope.
 * All sequences are stored in contextCountersTable (org-scoped and public).
 * Uses atomic upsert: INSERT ... ON CONFLICT DO UPDATE.
 *
 * @param scope - Typed scope from getSeqScope()
 * @returns The next sequence number
 */
export async function getNextSeq(scope: SeqScope): Promise<number> {
  const col = scope.column === 'mSeq' ? contextCountersTable.mSeq : contextCountersTable.seq;

  const result = await cdcDb
    .insert(contextCountersTable)
    .values({
      contextKey: scope.contextKey,
      [scope.column]: 1,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: contextCountersTable.contextKey,
      set: {
        [scope.column]: sql`${col} + 1`,
        updatedAt: new Date(),
      },
    })
    .returning({ value: col });

  return result[0].value;
}
