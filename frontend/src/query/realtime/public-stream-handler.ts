import type { PagesPublicStreamResponse } from '~/api.gen';
import { pageQueryKeys } from '~/modules/page/query';
import { queryClient } from '~/query/query-client';

/** Notification type from public pages stream. */
export type PublicStreamMessage = PagesPublicStreamResponse['activities'][number];

/**
 * Handles incoming public stream notifications and updates the React Query cache.
 * Processes page entity events (create, update, delete) for public/unauthenticated views.
 * Uses notification-based pattern: invalidates cache so data is refetched on access.
 */
export function handlePublicStreamMessage(message: PublicStreamMessage): void {
  // Only handle page entities
  if (message.entityType !== 'page') return;

  const { entityId, action } = message;

  switch (action) {
    case 'create':
      // Invalidate list queries to refetch with new page
      queryClient.invalidateQueries({ queryKey: pageQueryKeys.list.base });
      break;

    case 'update':
      // Invalidate to trigger refetch on access
      queryClient.invalidateQueries({ queryKey: pageQueryKeys.detail.byId(entityId) });
      // Invalidate list to refetch (entity data in list may differ from detail)
      queryClient.invalidateQueries({ queryKey: pageQueryKeys.list.base });
      break;

    case 'delete':
      // Remove from detail cache
      queryClient.removeQueries({ queryKey: pageQueryKeys.detail.byId(entityId) });
      // Invalidate list
      queryClient.invalidateQueries({ queryKey: pageQueryKeys.list.base });
      break;
  }
}
