import { advanceClock } from '#/core/stx/hlc';
import type { StxBase } from '#/schemas/sync-transaction-schemas';

/**
 * The stx stored with a write: the incoming mutation and source ids, and the stored field timestamps with the incoming
 * ones of `acceptedFieldNames`.
 */
export function buildStx(stx: StxBase, entity?: { stx: StxBase }, acceptedFieldNames?: string[]): StxBase {
  const existingTimestamps = entity?.stx.fieldTimestamps ?? {};
  const incomingTimestamps = stx.fieldTimestamps;

  // Advance the server clock from the incoming timestamps, for causal ordering.
  for (const ts of Object.values(incomingTimestamps)) advanceClock(ts);

  const mergedTimestamps: Record<string, string> = { ...existingTimestamps };
  for (const field of acceptedFieldNames ?? []) {
    if (incomingTimestamps[field]) mergedTimestamps[field] = incomingTimestamps[field];
  }

  return { mutationId: stx.mutationId, sourceId: stx.sourceId, fieldTimestamps: mergedTimestamps };
}
