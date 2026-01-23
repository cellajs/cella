import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { Page } from '~/api.gen';
import { useFieldTransactionStore } from '~/query/offline';
import type { StreamMessage, UseLiveStreamOptions } from '~/query/realtime';
import { useLiveStream } from '~/query/realtime';
import { pageQueryKeys } from './query';

/**
 * Hook to sync pages via live stream.
 * Automatically updates React Query cache when stream messages arrive.
 *
 * NOTE: This hook uses the org-scoped stream (`/organizations/:orgId/sync/stream`)
 * which requires authenticated users with org membership.
 *
 * For public page access, a separate public stream endpoint can be added.
 * See info/STREAM_REFACTOR_PLAN.md for the composable stream pattern.
 */
export function usePageLiveStream(orgId: string, options?: Partial<UseLiveStreamOptions>) {
  const queryClient = useQueryClient();
  const updateFieldTransaction = useFieldTransactionStore((s) => s.updateFromStreamMessage);

  const handleMessage = useCallback(
    (message: StreamMessage) => {
      // Only handle page entities
      if (message.entityType !== 'page') return;

      // Update field transaction tracking (for conflict detection)
      updateFieldTransaction(message);

      const { entityId, action, data } = message;

      switch (action) {
        case 'create':
          // Invalidate list queries to refetch with new page
          queryClient.invalidateQueries({ queryKey: pageQueryKeys.list.base });
          // Set detail query data if we have the full entity
          if (data) {
            queryClient.setQueryData(pageQueryKeys.detail.byId(entityId), data as Page);
          }
          break;

        case 'update':
          // Update in cache if we have entity data
          if (data) {
            queryClient.setQueryData(pageQueryKeys.detail.byId(entityId), data as Page);
          }
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
    },
    [queryClient, updateFieldTransaction],
  );

  return useLiveStream({
    orgId,
    entityTypes: ['page'],
    onMessage: handleMessage,
    ...options,
  });
}
