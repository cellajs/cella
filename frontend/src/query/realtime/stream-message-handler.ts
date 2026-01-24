import type { RealtimeEntityType } from 'config';
import type { Attachment, Page } from '~/api.gen';
import { attachmentQueryKeys } from '~/modules/attachment/query';
import { pageQueryKeys } from '~/modules/page/query';
import { initFieldTransactionFromEntity, updateFieldTransactions } from '~/query/offline';
import { queryClient } from '~/query/query-client';
import type { StreamMessage } from './stream-types';

/**
 * Entity-specific query key factories.
 * Maps realtime entity types to their query key creators.
 */
const entityQueryKeyMap: Record<
  RealtimeEntityType,
  {
    list: { base: readonly string[] };
    detail: { byId: (id: string) => readonly string[] };
  }
> = {
  attachment: attachmentQueryKeys,
  page: pageQueryKeys,
};

/**
 * Handles incoming stream messages and updates the React Query cache accordingly.
 * Routes messages to the correct entity-specific cache invalidation/update logic.
 * Also updates the field transaction store for conflict detection.
 *
 * @param message - The stream message from SSE
 */
export function handleStreamMessage(message: StreamMessage): void {
  const { entityType, entityId, action, data, tx } = message;

  // Update field transaction store for conflict detection
  // Priority: use message-level tx, fall back to entity data tx if available
  if (tx?.transactionId) {
    updateFieldTransactions(entityType, entityId, { ...tx, transactionId: tx.transactionId });
  } else if (data && typeof data === 'object' && 'tx' in data && data.tx) {
    // Entity data may include tx from database response
    initFieldTransactionFromEntity(entityType, entityId, data.tx as { transactionId?: string | null });
  }

  // Get query keys for this entity type
  const keys = entityQueryKeyMap[entityType as RealtimeEntityType];
  if (!keys) {
    console.debug('[handleStreamMessage] Unknown entity type:', entityType);
    return;
  }

  switch (action) {
    case 'create':
      // Invalidate list queries to refetch with new entity
      queryClient.invalidateQueries({ queryKey: keys.list.base });
      // Set detail query data if we have the full entity
      if (data) {
        queryClient.setQueryData(keys.detail.byId(entityId), data as Attachment | Page);
      }
      break;

    case 'update':
      // Update in cache if we have entity data, otherwise invalidate to refetch
      if (data) {
        queryClient.setQueryData(keys.detail.byId(entityId), data as Attachment | Page);
      } else {
        queryClient.invalidateQueries({ queryKey: keys.detail.byId(entityId) });
      }
      // Invalidate list to refetch
      queryClient.invalidateQueries({ queryKey: keys.list.base });
      break;

    case 'delete':
      // Remove from detail cache
      queryClient.removeQueries({ queryKey: keys.detail.byId(entityId) });
      // Invalidate list
      queryClient.invalidateQueries({ queryKey: keys.list.base });
      break;
  }
}
