import { isPublicProductEntity } from 'shared';
import type { StreamNotification } from '~/api.gen';
import { pageQueryKeys } from '~/modules/page/query';
import { queryClient } from '~/query/query-client';

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
  const { entityType, entityId, action } = message;

  // Only handle configured public entity types
  if (!entityType || !isPublicProductEntity(entityType)) {
    return;
  }

  const handler = entityQueryKeyHandlers[entityType];
  if (!handler) {
    console.debug(`[PublicStreamHandler] No handler for entity type: ${entityType}`);
    return;
  }

  switch (action) {
    case 'create':
      // Invalidate list queries to refetch with new entity
      queryClient.invalidateQueries({ queryKey: handler.listBase, refetchType: 'all' });
      break;

    case 'update':
      // Invalidate to trigger refetch on access
      queryClient.invalidateQueries({ queryKey: handler.detailById(entityId), refetchType: 'all' });
      // Invalidate list to refetch (entity data in list may differ from detail)
      queryClient.invalidateQueries({ queryKey: handler.listBase, refetchType: 'all' });
      break;

    case 'delete':
      // Remove from detail cache
      queryClient.removeQueries({ queryKey: handler.detailById(entityId) });
      // Invalidate list
      queryClient.invalidateQueries({ queryKey: handler.listBase, refetchType: 'all' });
      break;
  }
}
