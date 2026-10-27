import { advanceClock } from '#/core/stx/hlc';
import type { StxBase } from '#/schemas/sync-transaction-schemas';

/** StxBase with optional changedFields for CDC consumption (stored in jsonb, not part of API schema). */
type StxStored = StxBase & { changedFields?: string[] };

/**
 * The stx stored with a write: the incoming mutation and source ids, the stored field timestamps with the incoming ones
 * of `acceptedFieldNames`, and those names as `changedFields`, plus `updatedAt` on an update of `entity`.
 */
export function buildStx(stx: StxBase, entity?: { stx: StxBase }, acceptedFieldNames?: string[]): StxStored {
  const existingTimestamps = entity?.stx?.fieldTimestamps ?? {};
  const incomingTimestamps = stx.fieldTimestamps;

  // Advance the server clock from the incoming timestamps, for causal ordering.
  for (const ts of Object.values(incomingTimestamps)) advanceClock(ts);

  const mergedTimestamps: Record<string, string> = { ...existingTimestamps };
  for (const field of acceptedFieldNames ?? []) {
    if (incomingTimestamps[field]) mergedTimestamps[field] = incomingTimestamps[field];
  }

  // Every user-driven update writes updatedAt, which is how the CDC worker tells user edits from its own writes.
  const changedFields = acceptedFieldNames && entity ? [...acceptedFieldNames, 'updatedAt'] : acceptedFieldNames;

  return { mutationId: stx.mutationId, sourceId: stx.sourceId, fieldTimestamps: mergedTimestamps, ...(changedFields && { changedFields }) };
}
