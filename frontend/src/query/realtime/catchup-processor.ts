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
 * Process app stream catchup response. For each org: remove deleted entities, store org-level
 * and child-context entitySeqs, and use server/client seq deltas to fetch only changed entities
 * via `seqCursor` (falling back to list invalidation on first session or when delta is too large).
 * Deletes from `deletedByType` are always patched directly. Org-level seqs act as a fallback for
 * entity types without child-context data (e.g. org-scoped attachments).
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
    const { entitySeqs, deletedByType, childContextChanges } = changes[organizationId];
    // Resolve tenantId: prefer sync store (persisted, no cache dependency), fall back to query cache
    const tenantId = syncStore.getOrgTenantId(organizationId) ?? getTenantIdForOrg(organizationId);

    // Step 1: Remove deleted entities from cache (grouped by entityType for targeted removal)
    for (const [entityType, ids] of Object.entries(deletedByType)) {
      for (const entityId of ids) {
        cacheOps.removeEntity(entityType, entityId, organizationId);
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

          const deletedForType = deletedByType[entityType] ?? [];
          const keys = getEntityQueryKeys(entityType);

          if (clientContextSeq === 0) {
            // First session for this child context → full refetch for org's entity type
            cacheOps.invalidateEntityListForOrg(keys, organizationId, 'active');
            console.debug(`[CatchupProcessor] Context ${contextId}: ${entityType} first session → full refetch`);
          } else {
            const contextDelta = serverContextSeq - clientContextSeq;
            if (contextDelta > deletedForType.length) {
              // Creates/updates in this child context — delta fetch using context-scoped seq
              const seqCursor = String(clientContextSeq + 1);
              const patched = await cacheOps.fetchRangeAndPatch(entityType, organizationId, tenantId, seqCursor, keys);
              if (!patched) {
                cacheOps.invalidateEntityListForOrg(keys, organizationId, 'active');
              }
              console.debug(
                `[CatchupProcessor] Context ${contextId}: ${entityType} delta=${contextDelta} → ${patched ? 'delta patched' : 'invalidated'}`,
              );
            } else if (deletedForType.length > 0) {
              console.debug(
                `[CatchupProcessor] Context ${contextId}: ${entityType} only ${deletedForType.length} deletes (patched)`,
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
 * Process public stream catchup response. Removes deleted entities, then uses the server vs
 * stored seq delta to delta-fetch creates/updates via `seqCursor` (falls back to full list
 * invalidation on first session or when delta fetch is unavailable).
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
    const { deletedByType, entitySeqs } = changes[entityType];
    const deletedIds = deletedByType[entityType] ?? [];
    const serverSeq = entitySeqs?.[entityType] ?? 0;
    const clientSeq = syncStore.getPublicSeq(entityType);
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
    syncStore.setPublicSeq(entityType, serverSeq);
  }
}
