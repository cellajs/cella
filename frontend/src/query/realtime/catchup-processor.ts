/**
 * Catchup processors for offline sync.
 *
 * Processes summary-based catchup responses from the backend.
 * Uses server-provided entitySeqs delta to determine what changed per scope:
 *   - delta == deletedIds.length → only deletes (handled via direct cache patching)
 *   - delta > deletedIds.length → creates/updates → invalidate active entity lists for the org
 *   - delta == 0 → nothing changed
 *
 * Catchup triggers active query refetches for creates/updates (scoped per org),
 * and directly patches the cache for deletes. Inactive queries become stale
 * and refetch on next access via refetchOnMount.
 *
 * App stream: scoped per orgId with per-entityType granularity
 * Public stream: scoped per entityType
 */

import { getEntityQueryKeys, hasEntityQueryKeys } from '~/query/basic';
import { useSyncStore } from '~/store/sync';
import * as cacheOps from './cache-ops';
import * as membershipOps from './membership-ops';
import type { AppCatchupResponse, PublicCatchupResponse } from './types';

/**
 * Process app stream catchup response.
 *
 * For each org:
 * 1. Remove deletedIds from both detail and list caches (direct patching, no invalidation)
 * 2. Compare server entitySeqs delta vs deletedByType counts to detect creates/updates
 * 3. If creates/updates detected, invalidate active entity lists scoped to that org
 * 4. Update stored org-level seq
 *
 * Only active (mounted) queries refetch immediately. Inactive queries become stale
 * and refetch on next access — no separate sync service needed.
 */
export function processAppCatchup(response: AppCatchupResponse): void {
  const { changes } = response;
  const syncStore = useSyncStore.getState();
  const scopes = Object.keys(changes);

  if (scopes.length === 0) return;

  console.debug(`[CatchupProcessor] App catchup: ${scopes.length} orgs`);

  for (const orgId of scopes) {
    const { seq: serverSeq, deletedIds, mSeq: serverMSeq, entitySeqs, deletedByType } = changes[orgId];

    // Per-entityType granular processing (when entitySeqs available from backend)
    if (entitySeqs) {
      // Step 1: Remove deleted entities by type — patch both detail and list caches directly
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

      // Step 2: Per-entityType — detect creates/updates via server delta vs delete count
      // Use stored per-entityType seqs (set by previous catchup) for reliable delta calculation.
      // On first session (seqs = 0), all entity types show as having changes → full refresh, which is correct.
      for (const [entityType, serverEntitySeq] of Object.entries(entitySeqs)) {
        if (!hasEntityQueryKeys(entityType)) continue;

        const clientEntitySeq = syncStore.getSeq(`${orgId}:s:${entityType}`);
        if (serverEntitySeq === clientEntitySeq) continue; // Skip unchanged entity types

        const deletedForType = deletedByType?.[entityType] ?? [];
        const entityDelta = serverEntitySeq - clientEntitySeq;

        if (entityDelta > deletedForType.length) {
          // Creates/updates happened — invalidate active list queries for this org only
          const keys = getEntityQueryKeys(entityType);
          cacheOps.invalidateEntityListForOrg(keys, orgId, 'active');
          console.debug(
            `[CatchupProcessor] Org ${orgId}: ${entityType} delta=${entityDelta}, deletes=${deletedForType.length} → active refetch`,
          );
        } else if (deletedForType.length > 0) {
          console.debug(
            `[CatchupProcessor] Org ${orgId}: ${entityType} only ${deletedForType.length} deletes (patched)`,
          );
        }

        // Update per-entityType seq for next catchup comparison
        syncStore.setSeq(`${orgId}:s:${entityType}`, serverEntitySeq);
      }
    } else {
      // Fallback: org-level processing (backward compat with older backend)
      const clientSeq = syncStore.getSeq(orgId);
      const delta = serverSeq - clientSeq;

      // Step 1: Remove deleted entities from cache
      for (const entityId of deletedIds) {
        cacheOps.removeEntityById(entityId);
      }

      // Step 2: Invalidate active lists if creates/updates happened
      if (delta > deletedIds.length) {
        cacheOps.invalidateAllEntityLists('active');
        console.debug(`[CatchupProcessor] Org ${orgId}: delta=${delta}, deletes=${deletedIds.length} → active refetch`);
      } else if (deletedIds.length > 0) {
        console.debug(`[CatchupProcessor] Org ${orgId}: only ${deletedIds.length} deletes`);
      }
    }

    // Step 3: Handle membership changes via mSeq gap
    if (serverMSeq !== undefined) {
      const clientMSeq = syncStore.getSeq(`${orgId}:m`);
      if (serverMSeq > clientMSeq) {
        // Membership changes happened — invalidate all membership-related queries
        membershipOps.invalidateContextList(null);
        membershipOps.invalidateMemberships();
        membershipOps.invalidateMemberQueries(orgId);
        membershipOps.refreshMe();
        console.debug(`[CatchupProcessor] Org ${orgId}: mSeq gap ${clientMSeq}→${serverMSeq} → membership refresh`);
      }
      syncStore.setSeq(`${orgId}:m`, serverMSeq);
    }

    // Step 4: Update stored org-level seq
    syncStore.setSeq(orgId, serverSeq);
  }
}

/**
 * Process public stream catchup response.
 *
 * For each entityType:
 * 1. Remove deletedIds from cache
 * 2. Compare serverSeq with stored clientSeq
 * 3. If creates/updates detected, invalidate list
 * 4. Update stored seq
 */
export function processPublicCatchup(response: PublicCatchupResponse): void {
  const { changes } = response;
  const syncStore = useSyncStore.getState();
  const scopes = Object.keys(changes);

  if (scopes.length === 0) return;

  console.debug(`[CatchupProcessor] Public catchup: ${scopes.length} entity types`);

  for (const entityType of scopes) {
    const { seq: serverSeq, deletedIds } = changes[entityType];
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
      // Creates/updates → invalidate list for refetch
      cacheOps.invalidateEntityList(keys, 'all');
      console.debug(
        `[CatchupProcessor] Public ${entityType}: delta=${delta}, deletes=${deletedIds.length} → list invalidated`,
      );
    } else if (deletedIds.length > 0) {
      // Only deletes → list needs update too (items removed)
      cacheOps.invalidateEntityList(keys, 'all');
      console.debug(`[CatchupProcessor] Public ${entityType}: only ${deletedIds.length} deletes`);
    }

    // Phase 3: Update stored seq
    syncStore.setSeq(entityType, serverSeq);
  }
}
