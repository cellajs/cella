import type { PostAppCatchupResponse, PostPublicCatchupResponse } from 'sdk';
import { getEntityQueryKeys, hasEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { isInfiniteQueryData, isQueryData } from '~/query/basic/mutate-query';
import { queryClient } from '~/query/query-client';
import { useSyncStore } from '~/query/realtime/sync-store';
import * as cacheOps from './cache-ops';
import * as membershipOps from './membership-ops';
import { propagateEmbeddings } from './propagation';
import { getTenantIdForOrg } from './sync-priority';

/** Compatibility threshold for legacy hard-delete batches. Product soft deletes use seq tombstones. */
const DELETE_INVALIDATE_THRESHOLD = 100;

/**
 * Remove deleted entities of one type from an org's caches. Above DELETE_INVALIDATE_THRESHOLD
 * ids, invalidate the whole org list once instead of N per-id immutable cache rewrites.
 */
function removeDeletedFromOrg(entityType: string, ids: string[], organizationId: string): void {
  if (ids.length === 0) return;
  if (ids.length > DELETE_INVALIDATE_THRESHOLD) {
    if (hasEntityQueryKeys(entityType)) {
      cacheOps.invalidateEntityListForOrg(getEntityQueryKeys(entityType), organizationId, 'all');
    }
    return;
  }
  for (const entityId of ids) cacheOps.removeEntity(entityType, entityId, organizationId);
}

/**
 * Process app stream catchup response. For each org: apply legacy hard-delete removals, store org-level
 * and child-context entitySeqs, and use server/client seq deltas to fetch only changed entities
 * via `seqCursor` (falling back to list invalidation on first session or when delta is too large).
 * Soft-deleted product entities are returned by the seq fetch as tombstones and removed by cache-ops.
 */
export async function processAppCatchup(response: PostAppCatchupResponse, baselineOnly = false): Promise<void> {
  const { changes } = response;
  const syncStore = useSyncStore.getState();
  const scopes = Object.keys(changes);

  if (scopes.length === 0) return;

  // Baseline mode: store seqs for future catchup comparison, skip delta/invalidation.
  // Used on first connect — route loaders provide fresh data, catchup just establishes the seq baseline.
  if (baselineOnly) {
    for (const [organizationId, scope] of Object.entries(changes)) {
      if (scope.entitySeqs) {
        for (const [entityType, seq] of Object.entries(scope.entitySeqs)) {
          syncStore.setOrgSeq(organizationId, entityType, seq);
        }
      }
      if (scope.childContextChanges) {
        for (const [contextId, contextData] of Object.entries(scope.childContextChanges)) {
          if (!contextData.entitySeqs) continue;
          for (const [entityType, seq] of Object.entries(contextData.entitySeqs)) {
            syncStore.setContextSeq(organizationId, contextId, entityType, seq);
          }
        }
      }
    }
    console.debug(`[CatchupProcessor] Baseline: stored seqs for ${scopes.length} orgs`);
    return;
  }

  console.debug(`[CatchupProcessor] App catchup: ${scopes.length} orgs`);

  for (const organizationId of scopes) {
    const { entitySeqs, deletedByType, deleteOverflow, childContextChanges } = changes[organizationId];
    // Resolve tenantId: prefer sync store (persisted, no cache dependency), fall back to query cache
    const tenantId = syncStore.getOrgTenantId(organizationId) ?? getTenantIdForOrg(organizationId);

    // Detect membership change via the s:membership seq counter (set BEFORE Step 2 overwrites it).
    // Used to scope member-list invalidation to orgs that actually had a membership change.
    const serverMembershipSeq = entitySeqs?.membership;
    const membershipChanged =
      serverMembershipSeq !== undefined && serverMembershipSeq !== syncStore.getOrgSeq(organizationId, 'membership');

    // Step 1: Remove legacy hard-deleted entities from cache. Above a threshold (or when the server flags
    // overflow), invalidate the whole list once instead of removing entities one id at a time.
    for (const [entityType, ids] of Object.entries(deletedByType)) {
      removeDeletedFromOrg(entityType, ids, organizationId);
    }
    for (const entityType of deleteOverflow ?? []) {
      if (hasEntityQueryKeys(entityType)) {
        cacheOps.invalidateEntityListForOrg(getEntityQueryKeys(entityType), organizationId, 'all');
      }
    }

    // Step 2: Store org-level seqs (for next catchup screening) and track which entity types
    // have child-context data (so we know which to handle at org level as fallback)
    const entityTypesWithChildContextData = new Set<string>();

    if (entitySeqs) {
      for (const [entityType, serverEntitySeq] of Object.entries(entitySeqs)) {
        // Store org-level seq for next catchup comparison
        syncStore.setOrgSeq(organizationId, entityType, serverEntitySeq);
      }
    }

    // Step 3: Child-context delta processing (precise, per-child-context)
    if (childContextChanges) {
      for (const [contextId, contextData] of Object.entries(childContextChanges)) {
        if (!contextData.entitySeqs) continue;

        for (const [entityType, serverContextSeq] of Object.entries(contextData.entitySeqs)) {
          if (!hasEntityQueryKeys(entityType)) continue;
          entityTypesWithChildContextData.add(entityType);

          const clientContextSeq = syncStore.getContextSeq(organizationId, contextId, entityType);
          if (serverContextSeq === clientContextSeq) continue; // Skip unchanged context/entityType

          const keys = getEntityQueryKeys(entityType);

          if (clientContextSeq === 0) {
            // First session for this child context → full refetch for org's entity type
            cacheOps.invalidateEntityListForOrg(keys, organizationId, 'active');
            console.debug(`[CatchupProcessor] Context ${contextId}: ${entityType} first session → full refetch`);
          } else {
            const contextDelta = serverContextSeq - clientContextSeq;
            if (contextDelta > 0) {
              const seqCursor = String(clientContextSeq + 1);
              const patched = await cacheOps.fetchRangeAndPatch(entityType, organizationId, tenantId, seqCursor, keys);
              if (!patched) {
                cacheOps.invalidateEntityListForOrg(keys, organizationId, 'active');
              }
              console.debug(
                `[CatchupProcessor] Context ${contextId}: ${entityType} delta=${contextDelta} → ${patched ? 'delta patched' : 'invalidated'}`,
              );
            }
          }

          // Store child-context seq
          syncStore.setContextSeq(organizationId, contextId, entityType, serverContextSeq);
        }
      }
    }

    // Step 4: Org-level fallback for entity types WITHOUT child-context data
    // (e.g., org-scoped attachments where context_key = organization_id)
    if (entitySeqs) {
      for (const [entityType, serverEntitySeq] of Object.entries(entitySeqs)) {
        if (!hasEntityQueryKeys(entityType)) continue;
        if (entityTypesWithChildContextData.has(entityType)) continue; // Already handled at child-context level

        const clientEntitySeq = syncStore.getOrgSeq(organizationId, entityType);
        if (serverEntitySeq === clientEntitySeq) continue;

        const entityDelta = serverEntitySeq - clientEntitySeq;

        if (entityDelta > 0) {
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
              `[CatchupProcessor] Org ${organizationId}: ${entityType} delta=${entityDelta} → ${patched ? 'delta patched' : 'invalidated'}`,
            );
          }
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

    // Step 6: Invalidate org-scoped member queries only when membership actually changed
    // (detected via the s:membership seq counter), so entity-only changes don't refetch member lists.
    if (membershipChanged) membershipOps.invalidateMemberQueries(organizationId);
  }

  // Step 7: Refresh memberships — fetches getMyMemberships, invalidates context entity lists,
  // and refreshes the current user. Uses fetchQuery so React Query deduplicates with
  // the ensureQueryData call in getMenuData (sync service), preventing double fetches on app init.
  membershipOps.invalidateContextList(null);
  membershipOps.fetchMemberships();
  membershipOps.refreshMe();

  // TODO verify that this works, is there an integration test for this?
  // Step 8: Cache integrity check — compare server entity counts with cached totals.
  // Catches drift where seqs matched but cache is out of sync (e.g., failed refetch after invalidation).
  // Runs at both org level and child-context level for precision.
  verifyCacheIntegrity(changes);
}

/**
 * Verify cache integrity by comparing server-reported entity counts against
 * cached totals. Checks child-context counts (precise) first, then org-level
 * counts for entity types not covered by child contexts.
 */
function verifyCacheIntegrity(changes: PostAppCatchupResponse['changes']): void {
  for (const [organizationId, scope] of Object.entries(changes)) {
    // Collect all count checks: child-context scoped entries take priority over org-level
    const checks = new Map<string, { serverCount: number; contextId?: string }>();

    // Child-context counts (precise, per-project) — added first so they win
    if (scope.childContextChanges) {
      for (const [contextId, contextData] of Object.entries(scope.childContextChanges)) {
        if (!contextData.entityCounts) continue;
        for (const [entityType, serverCount] of Object.entries(contextData.entityCounts)) {
          checks.set(`${entityType}:${contextId}`, { serverCount, contextId });
        }
      }
    }

    // Org-level counts (fallback for entity types without child-context data)
    if (scope.entityCounts) {
      for (const [entityType, serverCount] of Object.entries(scope.entityCounts)) {
        // Skip if already covered by child-context checks
        if ([...checks.keys()].some((k) => k.startsWith(`${entityType}:`))) continue;
        checks.set(entityType, { serverCount });
      }
    }

    for (const [key, { serverCount, contextId }] of checks) {
      const entityType = key.split(':')[0];
      if (!hasEntityQueryKeys(entityType)) continue;

      const keys = getEntityQueryKeys(entityType);
      const cachedTotal = getCachedListTotal(keys, organizationId, contextId);
      if (cachedTotal === null || cachedTotal === serverCount) continue;

      cacheOps.invalidateEntityListForOrg(keys, organizationId, 'active');
      const scope = contextId ? `context ${contextId}` : `org ${organizationId}`;
      console.debug(
        `[CatchupProcessor] Integrity: ${entityType} in ${scope} count mismatch — cached=${cachedTotal}, server=${serverCount} → invalidated`,
      );
    }
  }
}

/**
 * Get the total count from the first matching cached list query for an entity type.
 * When contextId is provided, scopes the lookup to that specific context (e.g., project).
 * Returns null if no cached data exists.
 */
function getCachedListTotal(
  keys: ReturnType<typeof getEntityQueryKeys>,
  organizationId: string,
  contextId?: string,
): number | null {
  const queryKey = contextId ? keys.list.scope(organizationId, contextId) : keys.list.org(organizationId);
  const queries = queryClient.getQueriesData({ queryKey });

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
 * Process public stream catchup response. Applies legacy hard-delete removals, then uses the server vs
 * stored seq delta to delta-fetch creates/updates via `seqCursor` (falls back to full list
 * invalidation on first session or when delta fetch is unavailable). Soft deletes arrive as tombstones
 * in the seq result and are removed by cache-ops.
 */
export async function processPublicCatchup(response: PostPublicCatchupResponse, baselineOnly = false): Promise<void> {
  const { changes } = response;
  const syncStore = useSyncStore.getState();
  const scopes = Object.keys(changes);

  if (scopes.length === 0) return;

  // Baseline mode: store seqs only, skip delta/invalidation
  if (baselineOnly) {
    for (const [entityType, scope] of Object.entries(changes)) {
      if (scope.entitySeqs?.[entityType]) {
        syncStore.setPublicSeq(entityType, scope.entitySeqs[entityType]);
      }
    }
    console.debug(`[CatchupProcessor] Public baseline: stored seqs for ${scopes.length} entity types`);
    return;
  }

  console.debug(`[CatchupProcessor] Public catchup: ${scopes.length} entity types`);

  for (const entityType of scopes) {
    const { deletedByType, deleteOverflow, entitySeqs } = changes[entityType];
    const deletedIds = deletedByType[entityType] ?? [];
    const overflow = (deleteOverflow ?? []).includes(entityType);
    const serverSeq = entitySeqs?.[entityType] ?? 0;
    const clientSeq = syncStore.getPublicSeq(entityType);
    const delta = serverSeq - clientSeq;

    if (!hasEntityQueryKeys(entityType)) continue;
    const keys = getEntityQueryKeys(entityType);

    // Phase 1: Remove deleted entities from cache. Above a threshold (or on server-flagged
    // overflow), invalidate the whole list once instead of per-id removal.
    if (overflow || deletedIds.length > DELETE_INVALIDATE_THRESHOLD) {
      cacheOps.invalidateEntityList(keys, 'all');
    } else {
      for (const entityId of deletedIds) {
        cacheOps.removeEntity(entityType, entityId);
      }
    }

    // Phase 2: Fetch seq changes, including tombstones for soft deletes
    if (delta > 0) {
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
          `[CatchupProcessor] Public ${entityType}: delta=${delta} → ${patched ? 'delta patched' : 'invalidated'}`,
        );
      }
    } else if (deletedIds.length > 0) {
      // Only deletes → list needs update too (items removed)
      cacheOps.invalidateEntityList(keys, 'all');
      console.debug(`[CatchupProcessor] Public ${entityType}: only ${deletedIds.length} deletes`);
    }

    // Phase 3: Update stored seq
    syncStore.setPublicSeq(entityType, serverSeq);
  }
}
