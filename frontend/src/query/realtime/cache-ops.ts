/**
 * Pure cache operation primitives for entity sync.
 * Used by both live handler and catchup processor.
 */

import { type EntityQueryKeys, getEntityQueryKeys } from '~/query/basic';
import { queryClient } from '~/query/query-client';
import { removeCacheToken, storeCacheToken } from './cache-token-store';

/** Store cache token for entity (live notifications only) */
export function storeEntityCacheToken(entityType: string, entityId: string, token: string): void {
  storeCacheToken(entityType, entityId, token);
}

/** Remove entity from detail cache and remove cache token */
export function removeEntityFromCache(entityType: string, entityId: string): void {
  const keys = getEntityQueryKeys(entityType);
  if (keys) {
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
