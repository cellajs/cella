import type { StxBase } from '#/schemas/sync-transaction-schemas';
import { advanceClock, generateServerHLC } from './hlc';

/** StxBase with optional changedFields for CDC consumption (stored in jsonb, not part of API schema). */
export type StxStored = StxBase & { changedFields?: string[] };

/**
 * Build StxBase metadata for entity create or update mutations.
 */
export function buildStx(stx: StxBase, entity?: { stx: StxBase }, acceptedFieldNames?: string[]): StxStored {
  const existingTimestamps = entity?.stx?.fieldTimestamps ?? {};
  const incomingTimestamps = stx.fieldTimestamps;

  // Advance server clock from max incoming timestamp (ensures causal ordering)
  const allIncoming = Object.values(incomingTimestamps);
  if (allIncoming.length > 0) {
    for (const ts of allIncoming) advanceClock(ts);
  }

  // Merge timestamps: use incoming for accepted scalar fields, keep existing for everything else
  const mergedTimestamps: Record<string, string> = { ...existingTimestamps };
  if (acceptedFieldNames) {
    for (const field of acceptedFieldNames) {
      if (incomingTimestamps[field]) {
        mergedTimestamps[field] = incomingTimestamps[field];
      } else if (!mergedTimestamps[field]) {
        // Server-initiated field change (no client HLC) — generate server HLC
        mergedTimestamps[field] = generateServerHLC();
      }
    }
  }

  // For updates (entity provided), include 'updatedAt' in changedFields — every user-driven
  // update writes updatedAt. This lets the CDC worker distinguish user edits from its own
  // embedding-cleanup writes (which strip changedFields from stx entirely).
  const changedFields = acceptedFieldNames && entity ? [...acceptedFieldNames, 'updatedAt'] : acceptedFieldNames;

  return {
    mutationId: stx.mutationId,
    sourceId: stx.sourceId,
    fieldTimestamps: mergedTimestamps,
    ...(changedFields && { changedFields }),
  };
}
