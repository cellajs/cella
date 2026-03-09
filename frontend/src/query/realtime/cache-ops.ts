/**
 * Pure cache operation primitives for entity sync.
 * Used by both live handler and catchup processor.
 */

import {
  type EntityQueryKeys,
  getEntityDeltaFetch,
  getEntityQueryKeys,
  hasEntityQueryKeys,
} from '~/query/basic/entity-query-registry';
import { changeInfiniteQueryData, changeQueryData } from '~/query/basic/helpers';
import { isInfiniteQueryData, isQueryData } from '~/query/basic/mutate-query';
import type { ItemData } from '~/query/basic/types';
import { queryClient } from '~/query/query-client';
import { removeCacheToken, storeCacheToken } from './cache-token-store';

/**
 * Check if an entity has any pending (in-flight or paused) mutation.
 * When true, remote cache writes should be skipped to preserve optimistic state.
 * The mutation's own onSuccess will reconcile the cache when it settles.
 *
 * Checks update, create, and delete mutation keys following the standard
 * [entityType, 'update'|'create'|'delete'] convention from createEntityKeys.
 */
export function hasPendingMutationForEntity(entityType: string, entityId: string): boolean {
  const mutationCache = queryClient.getMutationCache();
  for (const suffix of ['update', 'create', 'delete'] as const) {
    const mutations = mutationCache.findAll({ mutationKey: [entityType, suffix] });
    for (const mutation of mutations) {
      if (mutation.state.status !== 'pending') continue;
      const variables = mutation.state.variables as { id?: string } | { id?: string }[] | undefined;
      if (Array.isArray(variables)) {
        if (variables.some((v) => v.id === entityId)) return true;
      } else if (variables?.id === entityId) {
        return true;
      }
    }
  }
  return false;
}

/** Store cache token for entity (live notifications only) */
export function storeEntityCacheToken(entityType: string, entityId: string, token: string): void {
  storeCacheToken(entityType, entityId, token);
}

/** Remove entity from detail cache and remove cache token */
export function removeEntityFromCache(entityType: string, entityId: string): void {
  if (hasEntityQueryKeys(entityType)) {
    const keys = getEntityQueryKeys(entityType);
    queryClient.removeQueries({ queryKey: keys.detail.byId(entityId) });
  }
  removeCacheToken(entityType, entityId);
}

/**
 * Remove entity by ID across all registered entity types.
 * Used when entityType is unknown (e.g., catchup deletedIds are entityType-agnostic within an org).
 */
export function removeEntityById(entityId: string): void {
  // Remove detail queries matching this entityId across all entity types
  // Since detail keys include the entityId, we can search all query cache entries
  const allQueries = queryClient.getQueryCache().findAll();
  for (const query of allQueries) {
    const key = query.queryKey;
    // Detail keys typically follow pattern: [entityType, 'detail', entityId, ...]
    if (Array.isArray(key) && key.length >= 3 && key[2] === entityId) {
      queryClient.removeQueries({ queryKey: key });
    }
  }
}

/** Invalidate entity detail query */
export function invalidateEntityDetail(
  entityId: string,
  keys: EntityQueryKeys,
  refetchType: 'active' | 'none' = 'active',
): void {
  queryClient.invalidateQueries({ queryKey: keys.detail.byId(entityId), refetchType });
}

/** Invalidate entity list queries */
export function invalidateEntityList(keys: EntityQueryKeys, refetchType: 'active' | 'none' | 'all' = 'active'): void {
  queryClient.invalidateQueries({ queryKey: keys.list.base, refetchType });
}

/**
 * Invalidate entity list queries scoped to a specific organization.
 * Only affects queries whose filter params include the matching orgId.
 * Used by catchup processor to avoid invalidating queries for unrelated orgs.
 */
export function invalidateEntityListForOrg(
  keys: EntityQueryKeys,
  orgId: string,
  refetchType: 'active' | 'none' | 'all' = 'active',
): void {
  queryClient.invalidateQueries({
    queryKey: keys.list.base,
    predicate: (query) => {
      const filters = query.queryKey[2];
      // Match queries whose filter object contains this orgId
      if (filters && typeof filters === 'object' && 'orgId' in filters) {
        return (filters as { orgId: string }).orgId === orgId;
      }
      // If no orgId in filters, include it (e.g., query without org scope)
      return true;
    },
    refetchType,
  });
}

/** Remove a single entity from all list caches by ID (no refetch triggered). */
export function removeEntityFromListCache(entityId: string, keys: EntityQueryKeys): void {
  for (const [queryKey, queryData] of queryClient.getQueriesData({ queryKey: keys.list.base })) {
    if (isInfiniteQueryData(queryData)) {
      changeInfiniteQueryData(queryKey, [{ id: entityId }], 'remove');
    } else if (isQueryData(queryData)) {
      changeQueryData(queryKey, [{ id: entityId }], 'remove');
    }
  }
}

/**
 * Fetch a single entity by ID and update both detail and list caches.
 * Uses query defaults (registered by entity modules via queryClient.setQueryDefaults)
 * to resolve the queryFn, so no entity-specific imports are needed here.
 * Falls back to list invalidation if no query defaults are registered.
 *
 * @param organizationId - Optional org ID from SSE notification, passed via meta
 *   so entity-specific queryFn can resolve path params (e.g., task needs orgId + tenantId).
 */
export async function fetchEntityAndUpdateList(
  entityId: string,
  keys: EntityQueryKeys,
  action: 'create' | 'update',
  organizationId?: string,
  entityType?: string,
): Promise<void> {
  // Skip remote writes for entities with pending mutations to preserve optimistic state.
  // The mutation's onSuccess will reconcile the cache when it settles.
  if (entityType && hasPendingMutationForEntity(entityType, entityId)) {
    console.debug(`[CacheOps] Skipping remote ${action} for ${entityType}:${entityId} — has pending mutation`);
    return;
  }

  try {
    const entity = await queryClient.fetchQuery<ItemData>({
      queryKey: keys.detail.byId(entityId),
      staleTime: 0, // Always fetch fresh on SSE notification
      meta: organizationId ? { organizationId } : undefined,
    });
    if (entity) {
      for (const [queryKey, queryData] of queryClient.getQueriesData({ queryKey: keys.list.base })) {
        if (isInfiniteQueryData(queryData)) {
          changeInfiniteQueryData(queryKey, [entity], action);
        } else if (isQueryData(queryData)) {
          changeQueryData(queryKey, [entity], action);
        }
      }
    }
  } catch {
    // No query defaults registered for this entity type — fall back to list invalidation
    invalidateEntityList(keys, 'all');
  }
}

/**
 * Invalidate all registered entity list queries.
 * Used during catchup when creates/updates are detected for an org scope.
 */
export function invalidateAllEntityLists(refetchType: 'active' | 'none' | 'all' = 'active'): void {
  // Query key convention: [entityType, 'list', ...] for all entity list queries
  // We invalidate queries matching ['*', 'list'] pattern
  queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey;
      return Array.isArray(key) && key.length >= 2 && key[1] === 'list';
    },
    refetchType,
  });
}

/**
 * Delta fetch changed entities and patch them into list + detail caches.
 * Uses the registered deltaFetch function to call the list endpoint with `afterSeq`.
 * Returns true if delta fetch succeeded, false if not available (caller should fall back to full invalidation).
 *
 * Each returned entity is upserted into all matching list caches and the detail cache is updated.
 */
export async function deltaFetchAndPatchList(
  entityType: string,
  orgId: string | null,
  afterSeq: number,
  keys: EntityQueryKeys,
): Promise<boolean> {
  const deltaFetch = getEntityDeltaFetch(entityType);
  if (!deltaFetch) return false;

  try {
    const { items } = await deltaFetch(orgId, afterSeq);
    if (items.length === 0) return true;

    // Upsert each entity into list caches and detail cache
    for (const entity of items) {
      // Skip entities with pending mutations to preserve optimistic state
      if (hasPendingMutationForEntity(entityType, entity.id)) {
        console.debug(`[CacheOps] Delta fetch: skipping ${entityType}:${entity.id} — has pending mutation`);
        continue;
      }

      // Update detail cache
      queryClient.setQueryData(keys.detail.byId(entity.id), entity);

      // Upsert into all matching list caches
      for (const [queryKey, queryData] of queryClient.getQueriesData({ queryKey: keys.list.base })) {
        if (isInfiniteQueryData(queryData)) {
          changeInfiniteQueryData(queryKey, [entity], 'update');
        } else if (isQueryData(queryData)) {
          changeQueryData(queryKey, [entity], 'update');
        }
      }
    }

    console.debug(`[CacheOps] Delta fetch: ${entityType} patched ${items.length} entities (afterSeq=${afterSeq})`);
    return true;
  } catch (error) {
    console.warn(`[CacheOps] Delta fetch failed for ${entityType}, falling back to invalidation`, error);
    return false;
  }
}
