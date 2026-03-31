/**
 * Catchup processors for offline sync.
 *
 * Processes summary-based catchup responses from the backend.
 * Uses server-provided entitySeqs (from CDC worker) to detect creates/updates.
 * Deletes are always provided by the backend via activities table scan (watertight).
 *
 * Dual-level change detection (app stream):
 *   1. Org-level entitySeqs: quick screening — "did anything change for this entity type?"
 *   2. Project-level projectChanges: precision — per-project entitySeqs for delta fetch
 *   - entityDelta > deletedForType.length → creates/updates → delta fetch via seqCursor (or invalidate as fallback)
 *   - deletedByType entries are always applied directly (cache patching)
 *   - entityDelta == 0 → nothing changed for this entity type
 *
 * When a registered deltaFetch is available, the catchup processor fetches only changed entities
 * via the list endpoint's `seqCursor` param and patches them into the cache. Falls back to full
 * list invalidation when delta fetch is unavailable, fails, or the delta is too large.
 *
 * App stream: dual-level seqs (org + project)
 * Public stream: unscoped seqs
 */

import type { PostAppCatchupResponse, PostPublicCatchupResponse } from 'sdk';
import { getEntityQueryKeys, hasEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { isInfiniteQueryData, isQueryData } from '~/query/basic/mutate-query';
import { queryClient } from '~/query/query-client';
import { useSyncStore } from '~/query/realtime/sync-store';
import * as cacheOps from './cache-ops';
import * as membershipOps from './membership-ops';
import { propagateEmbeddings } from './propagation';
import { getTenantIdForOrg } from './sync-priority';

/**
 * Process app stream catchup response.
 *
 * Dual-level processing for each org:
 * 1. Remove deleted entities from detail and list caches via deletedByType (direct patching)
 * 2. Store org-level entitySeqs (for next catchup screening)
 * 3. Process project-level changes: compare project entitySeqs for precise delta fetch
 * 4. Fall back to org-level delta for entity types without project-level data (e.g., org-scoped attachments)
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

  for (const organizationId of scopes) {
    const { entitySeqs, deletedByType, projectChanges } = changes[organizationId];
    const tenantId = getTenantIdForOrg(organizationId);

    // Step 1: Remove deleted entities from cache (grouped by entityType for targeted removal)
    for (const [entityType, ids] of Object.entries(deletedByType)) {
      for (const entityId of ids) {
        cacheOps.removeEntity(entityType, entityId, organizationId);
      }
    }

    // Step 2: Store org-level seqs (for next catchup screening) and track which entity types
    // have project-level data (so we know which to handle at org level as fallback)
    const entityTypesWithProjectData = new Set<string>();

    if (entitySeqs) {
      for (const [entityType, serverEntitySeq] of Object.entries(entitySeqs)) {
        // Store org-level seq for next catchup comparison
        syncStore.setSeq(`${organizationId}:s:${entityType}`, serverEntitySeq);
      }
    }

    // Step 3: Project-level delta processing (precise, per-project)
    if (projectChanges) {
      for (const [projectId, projectData] of Object.entries(projectChanges)) {
        if (!projectData.entitySeqs) continue;

        for (const [entityType, serverProjectSeq] of Object.entries(projectData.entitySeqs)) {
          if (!hasEntityQueryKeys(entityType)) continue;
          entityTypesWithProjectData.add(entityType);

          const clientProjectSeq = syncStore.getSeq(`${projectId}:s:${entityType}`);
          if (serverProjectSeq === clientProjectSeq) continue; // Skip unchanged project/entityType

          const deletedForType = deletedByType[entityType] ?? [];
          const keys = getEntityQueryKeys(entityType);

          if (clientProjectSeq === 0) {
            // First session for this project → full refetch for org's entity type
            cacheOps.invalidateEntityListForOrg(keys, organizationId, 'active');
            console.debug(`[CatchupProcessor] Project ${projectId}: ${entityType} first session → full refetch`);
          } else {
            const projectDelta = serverProjectSeq - clientProjectSeq;
            if (projectDelta > deletedForType.length) {
              // Creates/updates in this project — delta fetch using project-scoped seq
              const seqCursor = String(clientProjectSeq + 1);
              const patched = await cacheOps.fetchRangeAndPatch(entityType, organizationId, tenantId, seqCursor, keys);
              if (!patched) {
                cacheOps.invalidateEntityListForOrg(keys, organizationId, 'active');
              }
              console.debug(
                `[CatchupProcessor] Project ${projectId}: ${entityType} delta=${projectDelta} → ${patched ? 'delta patched' : 'invalidated'}`,
              );
            } else if (deletedForType.length > 0) {
              console.debug(
                `[CatchupProcessor] Project ${projectId}: ${entityType} only ${deletedForType.length} deletes (patched)`,
              );
            }
          }

          // Store project-level seq
          syncStore.setSeq(`${projectId}:s:${entityType}`, serverProjectSeq);
        }
      }
    }

    // Step 4: Org-level fallback for entity types WITHOUT project-level data
    // (e.g., org-scoped attachments where context_key = organization_id)
    if (entitySeqs) {
      for (const [entityType, serverEntitySeq] of Object.entries(entitySeqs)) {
        if (!hasEntityQueryKeys(entityType)) continue;
        if (entityTypesWithProjectData.has(entityType)) continue; // Already handled at project level

        const clientEntitySeq = syncStore.getSeq(`${organizationId}:s:${entityType}`);
        if (serverEntitySeq === clientEntitySeq) continue;

        const deletedForType = deletedByType[entityType] ?? [];
        const entityDelta = serverEntitySeq - clientEntitySeq;

        if (entityDelta > deletedForType.length) {
          const keys = getEntityQueryKeys(entityType);

          if (clientEntitySeq === 0) {
            cacheOps.invalidateEntityListForOrg(keys, organizationId, 'active');
            console.debug(`[CatchupProcessor] Org ${organizationId}: ${entityType} first session → full refetch`);
          } else {
            const seqCursor = String(clientEntitySeq + 1);
            const patched = await cacheOps.fetchRangeAndPatch(entityType, organizationId, tenantId, seqCursor, keys);
            if (!patched) {
              cacheOps.invalidateEntityListForOrg(keys, organizationId, 'active');
            }
            console.debug(
              `[CatchupProcessor] Org ${organizationId}: ${entityType} delta=${entityDelta}, deletes=${deletedForType.length} → ${patched ? 'delta patched' : 'invalidated'}`,
            );
          }
        } else if (deletedForType.length > 0) {
          console.debug(
            `[CatchupProcessor] Org ${organizationId}: ${entityType} only ${deletedForType.length} deletes (patched)`,
          );
        }
      }
    }

    // Step 5: Propagate embedded entity changes (e.g., label rename → patch task.labels)
    // Must run AFTER all delta-fetches so fresh source data is in cache.
    const { propagation } = changes[organizationId];
    if (propagation?.length) {
      for (const hint of propagation) {
        propagateEmbeddings(hint);
      }
    }

    // Step 6: Invalidate org-scoped member queries (per-org)
    membershipOps.invalidateMemberQueries(organizationId);
  }

  // Step 7: Refresh memberships — fetches getMyMemberships, invalidates context entity lists,
  // and refreshes the current user. Uses fetchQuery so React Query deduplicates with
  // the ensureQueryData call in getMenuData (sync service), preventing double fetches on app init.
  membershipOps.invalidateContextList(null);
  membershipOps.fetchMemberships();
  membershipOps.refreshMe();

  // Step 8: Cache integrity check — compare server entity counts with cached totals.
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
  for (const [organizationId, scope] of Object.entries(changes)) {
    if (!scope.entityCounts) continue;

    for (const [entityType, serverCount] of Object.entries(scope.entityCounts)) {
      if (!hasEntityQueryKeys(entityType)) continue;

      const keys = getEntityQueryKeys(entityType);
      const cachedTotal = getCachedListTotal(keys, organizationId);

      // Skip if no cached data (will be fetched fresh by ensureQueryData)
      if (cachedTotal === null) continue;

      if (cachedTotal !== serverCount) {
        cacheOps.invalidateEntityListForOrg(keys, organizationId, 'active');
        console.debug(
          `[CatchupProcessor] Integrity: ${entityType} in org ${organizationId} count mismatch — cached=${cachedTotal}, server=${serverCount} → invalidated`,
        );
      }
    }
  }
}

/**
 * Get the total count from the first matching cached list query for an entity type scoped to an org.
 * Returns null if no cached data exists.
 */
function getCachedListTotal(keys: ReturnType<typeof getEntityQueryKeys>, organizationId: string): number | null {
  const queries = queryClient.getQueriesData({ queryKey: keys.list.org(organizationId) });

  for (const [, data] of queries) {
    if (!data) continue;

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
 * 1. Remove deleted entities from cache (via deletedByType)
 * 2. Compare serverSeq (from counts JSONB) with stored clientSeq
 * 3. If creates/updates detected, delta fetch via seqCursor (falls back to invalidation)
 * 4. Update stored seq
 */
export async function processPublicCatchup(response: PostPublicCatchupResponse): Promise<void> {
  const { changes } = response;
  const syncStore = useSyncStore.getState();
  const scopes = Object.keys(changes);

  if (scopes.length === 0) return;

  console.debug(`[CatchupProcessor] Public catchup: ${scopes.length} entity types`);

  for (const entityType of scopes) {
    const { deletedByType, entitySeqs } = changes[entityType];
    const deletedIds = deletedByType[entityType] ?? [];
    const serverSeq = entitySeqs?.[entityType] ?? 0;
    const clientSeq = syncStore.getSeq(entityType);
    const delta = serverSeq - clientSeq;

    if (!hasEntityQueryKeys(entityType)) continue;
    const keys = getEntityQueryKeys(entityType);

    // Phase 1: Remove deleted entities from cache
    for (const entityId of deletedIds) {
      cacheOps.removeEntity(entityType, entityId);
    }

    // Phase 2: Determine if creates/updates happened
    if (delta > deletedIds.length) {
      // Creates/updates — try delta fetch, fall back to invalidation
      if (clientSeq === 0) {
        cacheOps.invalidateEntityList(keys, 'all');
        console.debug(`[CatchupProcessor] Public ${entityType}: first session → full refetch`);
      } else {
        const seqCursor = String(clientSeq + 1);
        const patched = await cacheOps.fetchRangeAndPatch(entityType, null, null, seqCursor, keys);
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
