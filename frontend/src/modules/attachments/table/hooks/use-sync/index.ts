import type { ChangeMessage, ShapeStreamOptions } from '@electric-sql/client';
import { getShapeStream } from '@electric-sql/react';
import { config } from 'config';
import { useEffect } from 'react';
import { env } from '~/env';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { type CamelToSnakeObject, convertMessageInfo } from '~/lib/use-sync';
import { handleDelete, handleInsert, handleUpdate } from '~/modules/attachments/table/hooks/use-sync/operation-handlers';
import type { Attachment } from '~/modules/attachments/types';
import { useSyncStore } from '~/store/sync';

// Configures ShapeStream options for real-time syncing of attachments
const attachmentShape = (organizationId: string): ShapeStreamOptions => ({
  url: new URL(`/${organizationId}/attachments/shape-proxy`, config.backendUrl).href,
  params: { where: `organization_id = '${organizationId}'` },
  backoffOptions: {
    initialDelay: 500,
    maxDelay: 32000,
    multiplier: 2,
  },
  fetchClient: (input, init) =>
    fetch(input, {
      ...init,
      credentials: 'include',
    }),
});

type RawAttachment = CamelToSnakeObject<Attachment>;

// Custom hook to sync attachments in real-time for a specific organization
export const useSync = (organizationId: string) => {
  const { isOnline } = useOnlineManager();
  const { getSyncData, setSyncData } = useSyncStore();

  const storeKey = `attachments-${organizationId}`; // Unique key for storing sync data based on organization ID

  useEffect(() => {
    // Exit if offline, sync is disabled, imado upload is disabled, or in quick mode
    if (!isOnline || !config.has.sync || !config.has.imado || env.VITE_QUICK) return;

    const controller = new AbortController();
    const syncData = getSyncData(storeKey);

    // Initialize ShapeStream
    const shapeStream = getShapeStream<RawAttachment>({
      ...attachmentShape(organizationId),
      signal: controller.signal, // Abort signal to be able to cancel it later
      ...(syncData ? syncData : {}), // Include previous sync data if there is any
    });

    // Subscribe to ShapeStream for real-time updates
    const unsubscribe = shapeStream.subscribe((messages) => {
      // Avoid triggering on initial load
      if (shapeStream.isLoading()) return;

      // Save latest offset and shape handle to store
      if (shapeStream.shapeHandle) {
        const newSyncData = { offset: shapeStream.lastOffset, handle: shapeStream.shapeHandle };
        setSyncData(storeKey, newSyncData);
      }

      // Filter out the messages that contain valid operations (create, update, delete)
      const operationMessages = messages.filter((m) => m.headers.operation && 'value' in m && m.value) as ChangeMessage<RawAttachment>[];
      if (!operationMessages.length) return;

      // Convert operation messages into respective arrays (inserts, updates, deletes)
      const insertArray = convertMessageInfo<Attachment>(operationMessages, 'insert');
      const updateArray = convertMessageInfo<Attachment>(operationMessages, 'update');
      const deleteIdsArray = convertMessageInfo<Attachment>(operationMessages, 'delete').map(({ id }) => id);

      // Handle operations
      if (insertArray.length) handleInsert(organizationId, insertArray);
      if (updateArray.length) handleUpdate(organizationId, updateArray);
      if (deleteIdsArray.length) handleDelete(organizationId, deleteIdsArray);
    });

    return () => {
      unsubscribe();
      // Abort shape's subscription to live updates
      /**
       * Note that if you have multiple components using the same component, this will stop updates for all subscribers.
       * Electric plan to add a better API for unsubscribing from updates & cleaning up shapes that are no longer needed.
       */
      controller.abort();
    };
  }, [isOnline]);
};
