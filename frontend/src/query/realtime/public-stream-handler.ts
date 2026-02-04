import { appConfig, type PublicProductEntityType } from 'config';
import type { PublicStreamActivity } from '~/api.gen';
import { pageQueryKeys } from '~/modules/page/query';
import { queryClient } from '~/query/query-client';

/**
 * Query key handlers for each public entity type.
 * Maps entity types to their query key generators.
 */
const entityQueryKeyHandlers: Record<
  PublicProductEntityType,
  {
    listBase: readonly unknown[];
    detailById: (id: string) => readonly unknown[];
  }
> = {
  page: {
    listBase: pageQueryKeys.list.base,
    detailById: (id) => pageQueryKeys.detail.byId(id),
  },
  // Add more public entity types here when they are added to config
};

/**
 * Handles incoming public stream notifications and updates the React Query cache.
 * Processes public entity events (create, update, delete) for public/unauthenticated views.
 * Uses notification-based pattern: invalidates cache so data is refetched on access.
 *
 * Uses refetchType: 'all' to ensure inactive queries (e.g., in closed sheets on mobile)
 * also refetch when they become active again.
 */
export function handlePublicStreamMessage(message: PublicStreamActivity): void {
  const { entityType, entityId, action } = message;

  // Only handle configured public entity types
  if (!entityType || !appConfig.publicProductEntityTypes.includes(entityType as PublicProductEntityType)) {
    return;
  }

  const handler = entityQueryKeyHandlers[entityType as PublicProductEntityType];
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
