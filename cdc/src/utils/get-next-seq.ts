import { incrementCounter } from '#/db/utils/counter-ops';
import type { SeqScope } from './get-seq-scope';

/** Counter namespace for activity sequences */
const SEQ_NAMESPACE = 'seq';

/**
 * Get the next sequence number for an activity scope.
 * Uses atomic counter increment for high performance (no table scans).
 *
 * @param seqScope - Scope information from getSeqScope()
 * @returns The next sequence number for this scope
 */
export async function getNextSeq(seqScope: SeqScope): Promise<number> {
  return incrementCounter(SEQ_NAMESPACE, seqScope.scopeValue);
}
