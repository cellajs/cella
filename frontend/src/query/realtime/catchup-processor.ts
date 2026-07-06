import type { PostAppCatchupResponse } from 'sdk';
import { getEntityQueryKeys, hasEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { isInfiniteQueryData, isQueryData } from '~/query/basic/mutate-query';
import { queryClient } from '~/query/query-client';
import { useSyncStore } from '~/query/realtime/sync-store';
import * as cacheOps from './cache-ops';
import * as membershipOps from './membership-ops';
import { propagateEmbeddings } from './propagation';
import { getTenantIdForOrg } from './sync-priority';

/**
 * Process app stream catchup response. For each org: store org-level and child-context entitySeqs,
 * and use server/client seq deltas to fetch only changed entities via `seqCursor` (falling back to
 * list invalidation on first session or when delta is too large). Soft-deleted product entities are
 * returned by the seq fetch as tombstones and removed by cache-ops.
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
    const { entitySeqs, childContextChanges } = changes[organizationId];
    // Resolve tenantId: prefer sync store (persisted, no cache dependency), fall back to query cache
    const tenantId = syncStore.getOrgTenantId(organizationId) ?? getTenantIdForOrg(organizationId);

    // Detect membership change via the s:membership seq counter (set BEFORE Step 1 overwrites it).
    // Used to scope member-list invalidation to orgs that actually had a membership change.
    const serverMembershipSeq = entitySeqs?.membership;
    const membershipChanged =
      serverMembershipSeq !== undefined && serverMembershipSeq !== syncStore.getOrgSeq(organizationId, 'membership');

    // Step 1: Snapshot client org-level seqs. Server seqs are stored immediately ONLY for
    // entity types this pipeline does not ingest (no registered query keys, e.g. membership —
    // handled via Step 5/6 invalidation). Ingestable types advance their cursor after Step 2/3
    // resolves, so a failed delta fetch never silently skips its seq window (advance-after-ingest).
    const entityTypesWithChildContextData = new Set<string>();
    const clientOrgSeqs = new Map<string, number>();

    if (entitySeqs) {
      for (const [entityType, serverEntitySeq] of Object.entries(entitySeqs)) {
        clientOrgSeqs.set(entityType, syncStore.getOrgSeq(organizationId, entityType));
        if (!hasEntityQueryKeys(entityType)) syncStore.setOrgSeq(organizationId, entityType, serverEntitySeq);
      }
    }

    // Step 2: Child-context delta processing (precise, per-child-context)
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
              // Scope-symmetry guard: a cursor is only authoritative for scopes with a cached
              // list; with nothing cached there is nothing to patch — mount hydration fetches
              // fresh and resets the cursor (see e.g. tasksCanonicalOptions).
              if (!hasAnyCachedList(keys, organizationId)) {
                console.debug(`[CatchupProcessor] Context ${contextId}: ${entityType} no cached list → skip delta`);
              } else {
                const seqCursor = String(clientContextSeq + 1);
                const patched = await cacheOps.fetchRangeAndPatch(
                  entityType,
                  organizationId,
                  tenantId,
                  seqCursor,
                  keys,
                );
                if (!patched) {
                  cacheOps.invalidateEntityListForOrg(keys, organizationId, 'active');
                }
                console.debug(
                  `[CatchupProcessor] Context ${contextId}: ${entityType} delta=${contextDelta} → ${patched ? 'delta patched' : 'invalidated'}`,
                );
              }
            }
          }

          // Store child-context seq — safe after ingest/invalidate/skip: a fetchRangeAndPatch
          // success means the range fully drained; invalidation hands recovery to react-query;
          // a skipped uncached scope is re-established by hydration itself.
          syncStore.setContextSeq(organizationId, contextId, entityType, serverContextSeq);
        }
      }
    }

    // Step 3: Org-level fallback for entity types WITHOUT child-context data
    // (e.g., org-scoped attachments where context_key = organization_id).
    // Org seqs for ingestable types are stored here, AFTER the delta fetch resolves —
    // never before, so a failed fetch retries the same window on the next catchup.
    if (entitySeqs) {
      for (const [entityType, serverEntitySeq] of Object.entries(entitySeqs)) {
        if (!hasEntityQueryKeys(entityType)) continue; // Stored in Step 1
        if (entityTypesWithChildContextData.has(entityType)) {
          // Fully handled at child-context level — advance the org-level screening seq
          syncStore.setOrgSeq(organizationId, entityType, serverEntitySeq);
          continue;
        }

        const clientEntitySeq = clientOrgSeqs.get(entityType) ?? 0;
        if (serverEntitySeq === clientEntitySeq) continue;

        const entityDelta = serverEntitySeq - clientEntitySeq;

        if (entityDelta > 0) {
          const keys = getEntityQueryKeys(entityType);

          if (clientEntitySeq === 0) {
            cacheOps.invalidateEntityListForOrg(keys, organizationId, 'active');
            console.debug(`[CatchupProcessor] Org ${organizationId}: ${entityType} first session → full refetch`);
          } else if (!hasAnyCachedList(keys, organizationId)) {
            // Scope-symmetry guard: nothing cached to patch — hydration re-establishes the cursor
            console.debug(`[CatchupProcessor] Org ${organizationId}: ${entityType} no cached list → skip delta`);
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

        // Advance-after-ingest: reached only when the window was drained, handed to
        // react-query via invalidation, or deliberately skipped (nothing cached).
        syncStore.setOrgSeq(organizationId, entityType, serverEntitySeq);
      }
    }

    // Step 4: Propagate embedded entity changes (e.g., label rename → patch task.labels)
    // Must run AFTER all delta-fetches so fresh source data is in cache.
    const { propagation } = changes[organizationId];
    if (propagation?.length) {
      for (const hint of propagation) {
        propagateEmbeddings(hint);
      }
    }

    // Step 5: Invalidate org-scoped member queries only when membership actually changed
    // (detected via the s:membership seq counter), so entity-only changes don't refetch member lists.
    if (membershipChanged) membershipOps.invalidateMemberQueries(organizationId);
  }

  // Step 6: Refresh memberships — fetches getMyMemberships, invalidates context entity lists,
  // and refreshes the current user. Uses fetchQuery so React Query deduplicates with
  // the ensureQueryData call in getMenuData (sync service), preventing double fetches on app init.
  membershipOps.invalidateContextList(null);
  membershipOps.fetchMemberships();
  membershipOps.refreshMe();

  // Step 7: Cache integrity check — compare server entity counts with cached totals.
  // Catches drift where seqs matched but cache is out of sync (e.g., failed refetch after invalidation).
  // Runs at both org level and child-context level for precision.
  verifyCacheIntegrity(changes);
}

/**
 * Whether any list query data is cached under the entity's org prefix (or base for public
 * entities) — mirrors the patch target of fetchRangeAndPatch. When nothing is cached a delta
 * fetch has nothing to patch: mount hydration fetches fresh and resets the cursor itself.
 */
function hasAnyCachedList(keys: ReturnType<typeof getEntityQueryKeys>, organizationId: string | null): boolean {
  const prefix = organizationId ? keys.list.org(organizationId) : keys.list.base;
  return queryClient.getQueriesData({ queryKey: prefix }).some(([, data]) => data !== undefined);
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
