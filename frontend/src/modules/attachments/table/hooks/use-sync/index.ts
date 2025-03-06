import type { ChangeMessage } from '@electric-sql/client';
import { getShapeStream } from '@electric-sql/react';
import { config } from 'config';
import { useEffect } from 'react';
import { env } from '~/env';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { type RawAttachment, attachmentShape, convertMessageIntoAttachments } from '~/modules/attachments/table/hooks/use-sync/helpers';
import { handleDelete, handleInsert, handleUpdate } from '~/modules/attachments/table/hooks/use-sync/operation-handlers';

// Custom hook to sync attachments in real-time for a specific organization
export const useSync = (organizationId: string) => {
  const { isOnline } = useOnlineManager();

  useEffect(() => {
    // Exit if offline, sync is disabled, imado upload is disabled, or in quick mode
    if (!isOnline || !config.has.sync || !config.has.imado || env.VITE_QUICK) return;

    // Initialize ShapeStream to listen for changes
    const shapeStream = getShapeStream<RawAttachment>(attachmentShape(organizationId));

    // Subscribe to ShapeStream for real-time updates
    const unsubscribe = shapeStream.subscribe((messages) => {
      // Avoid triggering on initial load
      if (shapeStream.isLoading()) return;

      // Filter messages with valid operations(create, update, delete)
      const operationMessages = messages.filter((m) => m.headers.operation && 'value' in m && m.value) as ChangeMessage<RawAttachment>[];
      if (!operationMessages.length) return;

      const insertArray = convertMessageIntoAttachments(operationMessages, 'insert');
      const updateArray = convertMessageIntoAttachments(operationMessages, 'update');
      const deleteIdsArray = convertMessageIntoAttachments(operationMessages, 'delete').map(({ id }) => id);

      if (insertArray.length) handleInsert(organizationId, insertArray);
      if (updateArray.length) handleUpdate(organizationId, updateArray);
      if (deleteIdsArray.length) handleDelete(organizationId, deleteIdsArray);
    });

    return () => unsubscribe();
  }, [isOnline]);
};
