/**
 * Public stream catch-up operation.
 * Entity-agnostic: uses hierarchy.publicStreamTypes dynamically.
 */

import { hierarchy } from 'shared';
import type { DbContext } from '#/core/context';
import type { OperationResult } from '#/core/operation-result';
import { baseDb as db } from '#/db/db';
import {
  DELETE_ENUMERATE_CAP,
  findContextCountersByKeys,
  findLatestPublicActivityId,
  findPublicDeleteActivities,
} from '#/modules/entities/entities-queries';
import { parseCounterCounts } from '#/modules/entities/helpers/parse-counter-counts';
import type { PublicCatchupResponse } from '#/schemas';

const dbCtx: DbContext = { var: { db } };

/** Prefix for public (org-less) entity seq keys in contextCountersTable — must match CDC */
const PUBLIC_SEQ_PREFIX = 'public';

/**
 * Fetch catchup summary for the public stream.
 *
 * Uses unscoped seqs from context_counters.counts['s:{entityType}']
 * (managed by CDC worker) for change detection.
 * Deletes are always scanned from activities (cursor-bounded, watertight).
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

  // Fast path: all seqs match → check for deletes only
  const hasSeqChanges = Object.keys(changes).length > 0;

  // Step 3: Always scan for deletes (cursor-bounded, capped). On overflow we flag the affected
  // entity types for whole-list invalidation and leave the cursor unchanged so the next catchup
  // re-scans the same window (idempotent — invalidation is lossless on repeat).
  let deleteOverflow = false;
  if (resolvedCursor) {
    const deletedResults = await findPublicDeleteActivities(dbCtx, resolvedCursor, publicTypes);

    deleteOverflow = deletedResults.length > DELETE_ENUMERATE_CAP;
    const rows = deleteOverflow ? deletedResults.slice(0, DELETE_ENUMERATE_CAP) : deletedResults;

    for (const row of rows) {
      if (!row.entityType || !row.subjectId) continue;

      // Ensure entityType has a changes entry (may not have one if only deletes happened)
      if (!changes[row.entityType]) {
        const serverSeq = serverSeqs.get(row.entityType) ?? 0;
        changes[row.entityType] = {
          deletedByType: {},
          entitySeqs: { [row.entityType]: serverSeq },
        };
      }

      const scope = changes[row.entityType];
      if (deleteOverflow) {
        // Too many deletes — flag the type for whole-list invalidation instead of per-id removal
        if (!scope.deleteOverflow) scope.deleteOverflow = [];
        if (!scope.deleteOverflow.includes(row.entityType)) scope.deleteOverflow.push(row.entityType);
      } else {
        if (!scope.deletedByType[row.entityType]) scope.deletedByType[row.entityType] = [];
        scope.deletedByType[row.entityType].push(row.subjectId);
      }
    }
  }

  // Fast path: nothing changed at all → return empty
  const allDeletesEmpty = Object.values(changes).every(
    (c) => Object.keys(c.deletedByType).length === 0 && (c.deleteOverflow?.length ?? 0) === 0,
  );
  if (!hasSeqChanges && allDeletesEmpty) {
    if (seqs && resolvedCursor) return { success: true, data: { changes: {}, cursor: resolvedCursor } };
  }

  // Step 4: Advance cursor. On delete overflow, keep the cursor unchanged so the next catchup
  // re-scans the same window — activity ids are LSN-derived and not lexicographically sortable.
  let newCursor = resolvedCursor;
  if (!deleteOverflow && (!resolvedCursor || Object.keys(changes).length > 0)) {
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
