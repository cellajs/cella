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

/** Invalidate entity detail query */
export function invalidateEntityDetail(
  entityId: string,
  keys: EntityQueryKeys,
  refetchType: 'active' | 'none' = 'active',
): void {
  queryClient.invalidateQueries({ queryKey: keys.detail.byId(entityId), refetchType });
}

/** Invalidate entity list queries */
export function invalidateEntityList(keys: EntityQueryKeys, refetchType: 'active' | 'none' = 'active'): void {
  queryClient.invalidateQueries({ queryKey: keys.list.base, refetchType });
}
