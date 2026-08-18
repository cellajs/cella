import type { StxBase } from '#/schemas/sync-transaction-schemas';
import { advanceClock } from './hlc';

/** StxBase with optional changedFields for CDC consumption (stored in jsonb, not part of API schema). */
export type StxStored = StxBase & { changedFields?: string[] };

export function buildStx(stx: StxBase, entity?: { stx: StxBase }, acceptedFieldNames?: string[]): StxStored {
  const existingTimestamps = entity?.stx?.fieldTimestamps ?? {};
  const incomingTimestamps = stx.fieldTimestamps;

  // Advance the server clock from the incoming timestamps, for causal ordering.
  const allIncoming = Object.values(incomingTimestamps);
  if (allIncoming.length > 0) {
    for (const ts of allIncoming) advanceClock(ts);
  }

  // Incoming timestamps for accepted scalar fields, existing ones for everything else.
  const mergedTimestamps: Record<string, string> = { ...existingTimestamps };
  if (acceptedFieldNames) {
    for (const field of acceptedFieldNames) {
      if (incomingTimestamps[field]) {
        mergedTimestamps[field] = incomingTimestamps[field];
      }
    }
  }

  // Every user-driven update writes updatedAt, which is how the CDC worker tells user edits from its own writes.
  const changedFields = acceptedFieldNames && entity ? [...acceptedFieldNames, 'updatedAt'] : acceptedFieldNames;

  return {
    mutationId: stx.mutationId,
    sourceId: stx.sourceId,
    fieldTimestamps: mergedTimestamps,
    ...(changedFields && { changedFields }),
  };
}
