import { sql } from 'drizzle-orm';
import { countersTable } from '#/db/schema/counters';
import { cdcDb } from '../db';
import type { SeqScope } from './get-seq-scope';

/** Counter namespace for activity sequences */
const SEQ_NAMESPACE = 'seq';

/**
 * Get the next sequence number for an activity scope.
 * Uses atomic counter increment for high performance (no table scans).
 *
 * NOTE: Uses cdcDb (cdc_role) which has SELECT, INSERT, UPDATE on counters.
 *
 * @param seqScope - Scope information from getSeqScope()
 * @returns The next sequence number for this scope
 */
export async function getNextSeq(seqScope: SeqScope): Promise<number> {
  const result = await cdcDb
    .insert(countersTable)
    .values({
      namespace: SEQ_NAMESPACE,
      scope: seqScope.scopeValue,
      key: '',
      value: 1,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [countersTable.namespace, countersTable.scope, countersTable.key],
      set: {
        value: sql`${countersTable.value} + 1`,
        updatedAt: new Date(),
      },
    })
    .returning({ value: countersTable.value });

  return result[0].value;
}
