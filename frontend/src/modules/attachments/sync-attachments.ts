import { type ShapeStreamOptions, isChangeMessage } from '@electric-sql/client';
import { getShapeStream } from '@electric-sql/react';
import { config } from 'config';
import { useEffect } from 'react';
import { env } from '~/env';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { clientConfig } from '~/lib/api';
import { handleDelete, handleInsert, handleUpdate } from '~/modules/attachments/sync-handlers';
import type { Attachment } from '~/modules/attachments/types';
import { useSyncStore } from '~/store/sync';
import { type CamelToSnakeObject, baseBackoffOptions as backoffOptions, errorHandler, processMessages } from '~/utils/electric-utils';

// Configure ShapeStream options
const attachmentShape = (organizationId: string, storePrefix: string): ShapeStreamOptions => {
  const params = { where: `organization_id = '${organizationId}'` };
  return {
    url: new URL(`/${organizationId}/attachments/shape-proxy`, config.backendUrl).href,
    params,
    backoffOptions,
    fetchClient: clientConfig.fetch,
    onError: (error) => {
      const retry = errorHandler(error, storePrefix);
      return retry ? { params } : undefined;
    },
  };
};

type RawAttachment = CamelToSnakeObject<Attachment>;

/**
 * Hook to receive attachments updates in real-time for a specific organization using electric ShapeStream
 * @param organizationId - Organization ID
 */
export const useAttachmentsSync = (organizationId: string) => {
  const { isOnline } = useOnlineManager();
  const { getSyncData, setSyncData } = useSyncStore();

  const storeKey = `attachments-${organizationId}`; // Unique key for storing sync data based on organization ID

  useEffect(() => {
    // Exit if offline, sync is disabled, s3 upload is disabled, or in quick mode
    if (!isOnline || !config.has.sync || !config.has.uploadEnabled || env.VITE_QUICK) return;

    const controller = new AbortController();
    // if any params of `attachmentShape` changes need to delete sync data from store
    const syncData = getSyncData(storeKey);

    // Initialize ShapeStream
    const shapeStream = getShapeStream<RawAttachment>({
      ...attachmentShape(organizationId, storeKey),
      signal: controller.signal, // Abort signal to be able to cancel it later
      ...(syncData ? syncData : {}), // Include previous sync data if there is any
    });

    // Subscribe to ShapeStream for real-time updates
    const unsubscribe = shapeStream.subscribe((messages) => {
      // Avoid triggering on initial load
      if (shapeStream.isLoading()) return;

      // Save latest offset and shape handle to store
      if (shapeStream.shapeHandle && shapeStream.isUpToDate) {
        const newSyncData = { offset: shapeStream.lastOffset, handle: shapeStream.shapeHandle };
        setSyncData(storeKey, newSyncData);
      }

      // Filter out the messages that contain valid operations (create, update, delete)
      const changeMessages = messages.filter(isChangeMessage);
      if (!changeMessages.length) return;

      // Process operation messages into respective arrays (insertData, updateData, deleteIds)
      const { insertData, updateData, deleteIds } = processMessages(changeMessages);

      // Handle operations
      if (insertData.length) handleInsert(organizationId, insertData);
      if (updateData.length) handleUpdate(organizationId, updateData);
      if (deleteIds.length) handleDelete(organizationId, deleteIds);
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
