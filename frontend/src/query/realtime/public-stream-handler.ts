import { isPublicProductEntity } from 'shared';
import type { StreamNotification } from '~/api.gen';
import { getEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { sourceId } from '~/query/offline';
import { queryClient } from '~/query/query-client';
import { useSyncStore } from '~/store/sync';
import * as cacheOps from './cache-ops';

/**
 * Handles incoming public stream notifications and updates the React Query cache.
 * Processes public entity events (create, update, delete) for public/unauthenticated views.
 * Uses notification-based pattern: invalidates cache so data is refetched on access.
 *
 * Uses the entity query key registry for dynamic lookup (same pattern as app-stream-handler),
 * avoiding direct imports from entity modules which can cause HMR initialization errors.
 *
 * Uses refetchType: 'all' to ensure inactive queries (e.g., in closed sheets on mobile)
 * also refetch when they become active again.
 */
export function handlePublicStreamNotification(message: StreamNotification): void {
  const { entityType, entityId, action, seq, stx } = message;

  // Only handle configured public entity types
  if (!entityType || !isPublicProductEntity(entityType)) {
    return;
  }

  // Echo prevention: skip data fetch/invalidation for own mutations,
  // but still patch stx metadata so subsequent mutations read fresh versions
  if (stx?.sourceId === sourceId) {
    if (entityType) cacheOps.patchEntityStxInCache(entityType, entityId, stx);
    console.debug('[handlePublicStreamNotification] Echo — patched stx, skipped data fetch:', stx.mutationId);
    return;
  }

  // Track unscoped seq watermark (from stamp_entity_seq trigger)
  if (seq !== null && seq !== undefined) {
    const store = useSyncStore.getState();
    const current = store.getSeq(entityType);
    if (seq > current) store.setSeq(entityType, seq);
  }

  // Use registry for dynamic lookup (keys registered at module load time by entity modules)
  const keys = getEntityQueryKeys(entityType);

  switch (action) {
    case 'create':
    case 'update':
      // Fetch single entity and patch both detail and list caches
      cacheOps.fetchEntityAndUpdateList(entityId, keys, action, undefined, entityType);
      break;

    case 'delete':
      // Remove from detail and list caches directly (no refetch needed)
      queryClient.removeQueries({ queryKey: keys.detail.byId(entityId) });
      cacheOps.removeEntityFromListCache(entityId, keys);
      break;
  }
}
