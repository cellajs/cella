import { isPublicProductEntity } from 'shared';
import type { StreamNotification } from '~/api.gen';
import { pageQueryKeys } from '~/modules/page/query';
import { queryClient } from '~/query/query-client';
import { useSyncStore } from '~/store/sync';

type QueryKeyHandler = {
  listBase: readonly unknown[];
  detailById: (id: string) => readonly unknown[];
};

/**
 * Query key handlers for each public entity type.
 * Maps entity types to their query key generators.
 * Note: Only entities with publicAccess configured in hierarchy need handlers here.
 */
const entityQueryKeyHandlers: Record<string, QueryKeyHandler> = {
  page: {
    listBase: pageQueryKeys.list.base,
    detailById: (id) => pageQueryKeys.detail.byId(id),
  },
  // Add more public entity types here when they are added to hierarchy
};

/**
 * Handles incoming public stream notifications and updates the React Query cache.
 * Processes public entity events (create, update, delete) for public/unauthenticated views.
 * Uses notification-based pattern: invalidates cache so data is refetched on access.
 *
 * Uses refetchType: 'all' to ensure inactive queries (e.g., in closed sheets on mobile)
 * also refetch when they become active again.
 */
export function handlePublicStreamNotification(message: StreamNotification): void {
  const { entityType, entityId, action, seq } = message;

  // Only handle configured public entity types
  if (!entityType || !isPublicProductEntity(entityType)) {
    return;
  }

  // Track seq for gap detection — scoped per entityType for public stream
  if (seq !== null && seq !== undefined) {
    useSyncStore.getState().setSeq(entityType, seq);
  }

  const handler = entityQueryKeyHandlers[entityType];
  if (!handler) {
    console.debug(`[PublicStreamHandler] No handler for entity type: ${entityType}`);
    return;
  }

  switch (action) {
    case 'create':
      // New entity - list must be refetched to include it
      queryClient.invalidateQueries({ queryKey: handler.listBase, refetchType: 'all' });
      break;

    case 'update':
      // Only invalidate detail - the entity already exists in the list,
      // it just needs fresh field values from a detail refetch.
      queryClient.invalidateQueries({ queryKey: handler.detailById(entityId), refetchType: 'all' });
      break;

    case 'delete':
      // Remove from detail cache
      queryClient.removeQueries({ queryKey: handler.detailById(entityId) });
      // List must be refetched to remove the deleted entity
      queryClient.invalidateQueries({ queryKey: handler.listBase, refetchType: 'all' });
      break;
  }
}
