import { advanceClock } from '#/core/stx/hlc';
import type { StxBase, StxStored } from '#/schemas/sync-transaction-schemas';

/**
 * The stx stored with a write: the incoming mutation and source ids, the stored field timestamps with the incoming ones
 * of `acceptedFieldNames`, and those names as `changedFields`, plus `updatedAt` on an update of `entity`.
 */
export function buildStx(stx: StxBase, entity?: { stx: StxBase }, acceptedFieldNames?: string[]): StxStored {
  const existingTimestamps = entity?.stx.fieldTimestamps ?? {};
  const incomingTimestamps = stx.fieldTimestamps;

  // Advance the server clock from the incoming timestamps, for causal ordering.
  for (const ts of Object.values(incomingTimestamps)) advanceClock(ts);

  const mergedTimestamps: Record<string, string> = { ...existingTimestamps };
  for (const field of acceptedFieldNames ?? []) {
    if (incomingTimestamps[field]) mergedTimestamps[field] = incomingTimestamps[field];
  }

  // An update's list also names updatedAt: a worker of the previous release reads a stored list without it as its own cleanup.
  const changedFields = acceptedFieldNames && entity ? [...acceptedFieldNames, 'updatedAt'] : acceptedFieldNames;

  return { mutationId: stx.mutationId, sourceId: stx.sourceId, fieldTimestamps: mergedTimestamps, ...(changedFields && { changedFields }) };
}
