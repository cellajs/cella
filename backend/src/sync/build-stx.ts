import type { StxBase } from '#/schemas/sync-transaction-schemas';
import { advanceClock, generateServerHLC } from './hlc';

/** StxBase with optional changedFields for CDC consumption (stored in jsonb, not part of API schema). */
export type StxStored = StxBase & { changedFields?: string[] };

/**
 * Build StxBase metadata for entity create or update mutations.
 * Entity-agnostic — works for any product entity with stx support.
 *
 * **Create** (no entity/changedFields): empty fieldTimestamps, no changedFields.
 * ```ts
 * stx: buildStx(stx)
 * ```
 *
 * **Update** (with entity + incomingTimestamps): merges incoming HLC timestamps
 * for accepted fields, preserves existing for unchanged. Persists changedFields
 * so CDC can skip the expensive WAL row diff.
 * ```ts
 * stx: buildStx(stx, entity, acceptedFieldNames)
 * ```
 */
export function buildStx(
  stx: Pick<StxBase, 'mutationId' | 'sourceId' | 'fieldTimestamps'>,
  entity?: { stx?: StxBase | null },
  acceptedFieldNames?: string[],
): StxStored {
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

  return {
    mutationId: stx.mutationId,
    sourceId: stx.sourceId,
    fieldTimestamps: mergedTimestamps,
    ...(acceptedFieldNames && { changedFields: acceptedFieldNames }),
  };
}
