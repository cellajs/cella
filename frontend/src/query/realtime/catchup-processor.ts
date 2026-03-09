/**
 * Catchup processors for offline sync.
 *
 * Processes summary-based catchup responses from the backend.
 * Uses server-provided entitySeqs (from stamp_entity_seq_at trigger) to detect creates/updates.
 * Deletes are always provided by the backend via activities table scan (watertight).
 *
 *   - entityDelta > deletedForType.length → creates/updates → delta fetch via afterSeq (or invalidate as fallback)
 *   - deletedIds are always applied directly (cache patching)
 *   - entityDelta == 0 → nothing changed for this entity type
 *
 * When a registered deltaFetch is available, the catchup processor fetches only changed entities
 * via the list endpoint's `afterSeq` param and patches them into the cache. Falls back to full
 * list invalidation when delta fetch is unavailable, fails, or the delta is too large.
 *
 * App stream: contextEntity-scoped seqs
 * Public stream: unscoped seqs
 */

import type { PostAppCatchupResponse, PostPublicCatchupResponse } from '~/api.gen';
import { getEntityQueryKeys, hasEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { isInfiniteQueryData, isQueryData } from '~/query/basic/mutate-query';
import { queryClient } from '~/query/query-client';
import { useSyncStore } from '~/store/sync';
import * as cacheOps from './cache-ops';
import * as membershipOps from './membership-ops';

/**
 * Process app stream catchup response.
 *
 * For each org:
 * 1. Remove deletedIds from both detail and list caches (direct patching)
 * 2. Compare server entitySeqs delta vs deletedByType counts to detect creates/updates
 * 3. If creates/updates detected, delta fetch via afterSeq (falls back to invalidation)
 * 4. Update stored contextEntity-scoped seqs
 *
 * Delta fetch is used when the change count is small enough. On first session (clientEntitySeq = 0)
 * or when delta exceeds the fetch limit, falls back to full list invalidation.
 */
export async function processAppCatchup(response: PostAppCatchupResponse): Promise<void> {
  const { changes } = response;
  const syncStore = useSyncStore.getState();
  const scopes = Object.keys(changes);

  if (scopes.length === 0) return;

  console.debug(`[CatchupProcessor] App catchup: ${scopes.length} orgs`);

  for (const orgId of scopes) {
    const { deletedIds, entitySeqs, deletedByType } = changes[orgId];

    // Step 1: Remove deleted entities from cache
    if (deletedByType) {
      for (const [entityType, ids] of Object.entries(deletedByType)) {
        if (!hasEntityQueryKeys(entityType)) continue;
        const keys = getEntityQueryKeys(entityType);
        for (const entityId of ids) {
          cacheOps.removeEntityFromCache(entityType, entityId);
          cacheOps.removeEntityFromListCache(entityId, keys);
        }
      }
    } else {
      // Fallback: remove deleted entities across all types (entityType-agnostic)
      for (const entityId of deletedIds) {
        cacheOps.removeEntityById(entityId);
      }
    }

    // Step 2: Detect creates/updates via server delta vs delete count
    // Use stored contextEntity-scoped seqs (set by previous catchup or live SSE) for delta calculation.
    // On first session (seqs = 0), all entity types show as having changes → full refresh, which is correct.
    if (entitySeqs) {
      for (const [entityType, serverEntitySeq] of Object.entries(entitySeqs)) {
        if (!hasEntityQueryKeys(entityType)) continue;

        const clientEntitySeq = syncStore.getSeq(`${orgId}:s:${entityType}`);
        if (serverEntitySeq === clientEntitySeq) continue; // Skip unchanged entity types

        const deletedForType = deletedByType?.[entityType] ?? [];
        const entityDelta = serverEntitySeq - clientEntitySeq;

        if (entityDelta > deletedForType.length) {
          // Creates/updates happened — try delta fetch, fall back to invalidation
          const keys = getEntityQueryKeys(entityType);

          // Skip delta fetch on first session (no baseline) or very large deltas
          if (clientEntitySeq === 0) {
            cacheOps.invalidateEntityListForOrg(keys, orgId, 'active');
            console.debug(`[CatchupProcessor] Org ${orgId}: ${entityType} first session → full refetch`);
          } else {
            const patched = await cacheOps.deltaFetchAndPatchList(entityType, orgId, clientEntitySeq, keys);
            if (!patched) {
              cacheOps.invalidateEntityListForOrg(keys, orgId, 'active');
            }
            console.debug(
              `[CatchupProcessor] Org ${orgId}: ${entityType} delta=${entityDelta}, deletes=${deletedForType.length} → ${patched ? 'delta patched' : 'invalidated'}`,
            );
          }
        } else if (deletedForType.length > 0) {
          console.debug(
            `[CatchupProcessor] Org ${orgId}: ${entityType} only ${deletedForType.length} deletes (patched)`,
          );
        }

        // Update contextEntity-scoped seq for next catchup comparison
        syncStore.setSeq(`${orgId}:s:${entityType}`, serverEntitySeq);
      }
    }

    // Step 3: Invalidate org-scoped member queries (per-org)
    membershipOps.invalidateMemberQueries(orgId);
  }

  // Step 4: Refresh memberships — fetches getMyMemberships, invalidates context entity lists,
  // and refreshes the current user. Uses fetchQuery so React Query deduplicates with
  // the ensureQueryData call in getMenuData (sync service), preventing double fetches on app init.
  membershipOps.invalidateContextList(null);
  membershipOps.fetchMemberships();
  membershipOps.refreshMe();

  // Step 5: Cache integrity check — compare server entity counts with cached totals.
  // Catches drift where seqs matched but cache is out of sync (e.g., failed refetch after invalidation).
  verifyCacheIntegrity(changes);
}

/**
 * Verify cache integrity by comparing server-reported entity counts against
 * cached totals for each org. If counts diverge, the cache is stale despite
 * matching seqs — invalidate the affected list queries.
 *
 * Only checks product entity types that have registered query keys and
 * where entityCounts are provided by the backend.
 */
function verifyCacheIntegrity(changes: PostAppCatchupResponse['changes']): void {
  for (const [orgId, scope] of Object.entries(changes)) {
    if (!scope.entityCounts) continue;

    for (const [entityType, serverCount] of Object.entries(scope.entityCounts)) {
      if (!hasEntityQueryKeys(entityType)) continue;

      const keys = getEntityQueryKeys(entityType);
      const cachedTotal = getCachedListTotal(keys, orgId);

      // Skip if no cached data (will be fetched fresh by ensureQueryData)
      if (cachedTotal === null) continue;

      if (cachedTotal !== serverCount) {
        cacheOps.invalidateEntityListForOrg(keys, orgId, 'active');
        console.debug(
          `[CatchupProcessor] Integrity: ${entityType} in org ${orgId} count mismatch — cached=${cachedTotal}, server=${serverCount} → invalidated`,
        );
      }
    }
  }
}

/**
 * Get the total count from the first matching cached list query for an entity type scoped to an org.
 * Returns null if no cached data exists.
 */
function getCachedListTotal(keys: ReturnType<typeof getEntityQueryKeys>, orgId: string): number | null {
  const queries = queryClient.getQueriesData({ queryKey: keys.list.base });

  for (const [queryKey, data] of queries) {
    if (!data) continue;

    // Check if this query is scoped to the target org
    const filters = queryKey[2];
    if (
      filters &&
      typeof filters === 'object' &&
      'orgId' in filters &&
      (filters as { orgId: string }).orgId !== orgId
    ) {
      continue;
    }

    // Extract total from either infinite or standard query data
    if (isInfiniteQueryData(data)) {
      const firstPage = data.pages[0];
      if (firstPage && 'total' in firstPage) return (firstPage as { total: number }).total;
    } else if (isQueryData(data)) {
      return (data as { total: number }).total;
    }
  }

  return null;
}

/**
 * Process public stream catchup response.
 *
 * For each entityType:
 * 1. Remove deletedIds from cache
 * 2. Compare serverSeq (from counts JSONB) with stored clientSeq
 * 3. If creates/updates detected, delta fetch via afterSeq (falls back to invalidation)
 * 4. Update stored seq
 */
export async function processPublicCatchup(response: PostPublicCatchupResponse): Promise<void> {
  const { changes } = response;
  const syncStore = useSyncStore.getState();
  const scopes = Object.keys(changes);

  if (scopes.length === 0) return;

  console.debug(`[CatchupProcessor] Public catchup: ${scopes.length} entity types`);

  for (const entityType of scopes) {
    const { deletedIds, entitySeqs } = changes[entityType];
    const serverSeq = entitySeqs?.[entityType] ?? 0;
    const clientSeq = syncStore.getSeq(entityType);
    const delta = serverSeq - clientSeq;

    if (!hasEntityQueryKeys(entityType)) continue;
    const keys = getEntityQueryKeys(entityType);

    // Phase 1: Remove deleted entities from cache
    for (const entityId of deletedIds) {
      cacheOps.removeEntityFromCache(entityType, entityId);
    }

    // Phase 2: Determine if creates/updates happened
    if (delta > deletedIds.length) {
      // Creates/updates — try delta fetch, fall back to invalidation
      if (clientSeq === 0) {
        cacheOps.invalidateEntityList(keys, 'all');
        console.debug(`[CatchupProcessor] Public ${entityType}: first session → full refetch`);
      } else {
        const patched = await cacheOps.deltaFetchAndPatchList(entityType, null, clientSeq, keys);
        if (!patched) {
          cacheOps.invalidateEntityList(keys, 'all');
        }
        console.debug(
          `[CatchupProcessor] Public ${entityType}: delta=${delta}, deletes=${deletedIds.length} → ${patched ? 'delta patched' : 'invalidated'}`,
        );
      }
    } else if (deletedIds.length > 0) {
      // Only deletes → list needs update too (items removed)
      cacheOps.invalidateEntityList(keys, 'all');
      console.debug(`[CatchupProcessor] Public ${entityType}: only ${deletedIds.length} deletes`);
    }

    // Phase 3: Update stored seq
    syncStore.setSeq(entityType, serverSeq);
  }
}
