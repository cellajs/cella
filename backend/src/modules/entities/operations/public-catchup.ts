/**
 * Public stream catch-up operation.
 * Entity-agnostic: uses hierarchy.publicStreamTypes dynamically.
 */

import { hierarchy } from 'shared';
import type { DbContext } from '#/core/context';
import type { OperationResult } from '#/core/operation-result';
import { baseDb as db } from '#/db/db';
import { findContextCountersByKeys, findLatestPublicActivityId } from '#/modules/entities/entities-queries';
import { parseCounterCounts } from '#/modules/entities/helpers/parse-counter-counts';
import type { PublicCatchupResponse } from '#/schemas';

const dbCtx: DbContext = { var: { db } };

/** Prefix for public (org-less) entity seq keys in contextCountersTable — must match CDC */
const PUBLIC_SEQ_PREFIX = 'public';

/**
 * Fetch catchup summary for the public stream.
 *
 * Uses unscoped seqs from context_counters.counts['s:{entityType}']
 * (managed by CDC worker) for change detection, including soft-delete tombstones.
 *
 * When clientSeqs are provided and all match, returns immediately
 * (no activities query at all — the common reconnect case).
 */
export async function publicCatchupOp(
  cursor: string | null | undefined,
  seqs?: Record<string, number>,
): Promise<OperationResult<PublicCatchupResponse>> {
  const resolvedCursor = cursor ?? null;
  const publicTypes = [...hierarchy.publicStreamTypes];

  if (publicTypes.length === 0) return { success: true, data: { changes: {}, cursor: resolvedCursor } };

  // Map entityType → contextCounters contextKey (e.g. 'page' → 'public:page')
  const publicEntityIds = publicTypes.map((t) => `${PUBLIC_SEQ_PREFIX}:${t}`);

  // Step 1: Get current counts from contextCountersTable (fast PK lookup)
  const counterRows = await findContextCountersByKeys(dbCtx, publicEntityIds);

  // Extract unscoped seq from counts JSONB (s:{entityType} key)
  const serverSeqs = new Map<string, number>();
  for (const row of counterRows) {
    const entityType = row.contextKey.replace(`${PUBLIC_SEQ_PREFIX}:`, '');
    const { entitySeqs } = parseCounterCounts(row.counts);
    serverSeqs.set(entityType, entitySeqs[entityType] ?? 0);
  }

  // Step 2: Build changes for scopes with seq gaps (or all scopes if no clientSeqs)
  const changes: PublicCatchupResponse['changes'] = {};

  for (const entityType of publicTypes) {
    const serverSeq = serverSeqs.get(entityType) ?? 0;
    const clientSeq = seqs?.[entityType] ?? 0;

    if (!seqs || serverSeq !== clientSeq) {
      changes[entityType] = {
        deletedByType: {},
        entitySeqs: { [entityType]: serverSeq },
      };
    }
  }

  // Fast path: nothing changed at all → return empty
  if (Object.keys(changes).length === 0) {
    if (seqs && resolvedCursor) return { success: true, data: { changes: {}, cursor: resolvedCursor } };
  }

  // Step 3: Advance cursor.
  let newCursor = resolvedCursor;
  if (!resolvedCursor || Object.keys(changes).length > 0) {
    newCursor = (await getLatestPublicActivityId()) ?? resolvedCursor;
  }

  return { success: true, data: { changes, cursor: newCursor } };
}

/**
 * Get latest public entity activity ID (for 'now' offset and as cursor).
 * Exported for use by stream handler.
 */
export async function getLatestPublicActivityId(): Promise<string | null> {
  const publicTypes = [...hierarchy.publicStreamTypes];
  if (publicTypes.length === 0) return null;
  return findLatestPublicActivityId(dbCtx, publicTypes);
}
