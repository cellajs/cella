import { useLoaderData } from '@tanstack/react-router';
import { appConfig } from 'config';
import { useEffect, useRef } from 'react';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { attachmentStorage } from '~/modules/attachments/dexie/storage-service';
import { parseUploadedAttachments } from '~/modules/attachments/helpers';
import { createBaseTransloaditUppy } from '~/modules/common/uploader/helpers';
import type { UploadedUppyFile } from '~/modules/common/uploader/types';
import { OrganizationAttachmentsRoute } from '~/routes/organization-routes';

// TODO(DAVID)(improvement) make uploaded attachment naming right, if it was changed during offline update it on upload
export const useDexieLocalSync = (organizationId: string) => {
  const { isOnline } = useOnlineManager();
  const { attachmentsCollection } = useLoaderData({ from: OrganizationAttachmentsRoute.id });

  const isSyncingRef = useRef(false); // Prevent double trigger

  useEffect(() => {
    if (!isOnline || isSyncingRef.current || !appConfig.has.uploadEnabled) return;

    const syncStoreAttachments = async () => {
      isSyncingRef.current = true;

      try {
        // Get files that need syncing
        const filesNeedingSync = await attachmentStorage.getFilesNeedingSync(organizationId);

        if (!filesNeedingSync.length) {
          isSyncingRef.current = false;
          return;
        }

        const files = filesNeedingSync.map(({ files }) => Object.values(files)).flat();

        if (!files.length) return;

        const localUppy = await createBaseTransloaditUppy(
          {
            restrictions: {
              maxFileSize: 10 * 1024 * 1024, // 10MB
              maxNumberOfFiles: 20,
              allowedFileTypes: ['*/*'],
              maxTotalFileSize: 100 * 1024 * 1024, // 100MB
              minFileSize: null,
              minNumberOfFiles: 1,
              requiredMetaFields: [],
            },
          },
          filesNeedingSync[0].tokenQuery,
        );

        localUppy
          .on('error', async (err) => {
            console.error('Sync files upload error:', err);
            await attachmentStorage.updateFilesSyncStatus(organizationId, 'failed');
            localUppy.destroy();
          })
          .on('upload', async () => {
            console.info('Sync files upload started for batch:', organizationId);
            await attachmentStorage.updateFilesSyncStatus(organizationId, 'processing');
          })
          .on('transloadit:complete', async (assembly) => {
            if (assembly.error) throw new Error(assembly.error);
            const attachments = parseUploadedAttachments(assembly.results as UploadedUppyFile<'attachment'>, organizationId);

            attachmentsCollection.insert(attachments);
            console.info('Successfully synced attachments to server:', attachments);

            // Clean up offline files from Dexie
            await attachmentStorage.removeFiles(filesNeedingSync);
            console.info('Successfully removed uploaded files from Dexie.');
          });

        for (const uppyFile of files) {
          // Ensure `data` is non-null to satisfy Uppy types: fall back to a size-only object when missing.
          const data = uppyFile.data ?? { size: uppyFile.size ?? null };
          localUppy.addFile({ ...uppyFile, name: uppyFile.name || `${uppyFile.type}-${uppyFile.id}`, data });
        }

        await localUppy.upload();
        localUppy.destroy();
      } catch {
      } finally {
        isSyncingRef.current = false;
      }
    };

    syncStoreAttachments();
  }, [isOnline, organizationId, attachmentsCollection]);

  // // Ensures that any in-progress sync is marked as idle, so the next page load can correctly start syncing again.
  // useEffect(() => {
  //   const handleBeforeUnload = async () => {
  //     try {
  //       const batchesNeedingSync = await attachmentStorage.getBatchesNeedingSync(organizationId);
  //       for (const batch of batchesNeedingSync) {
  //         if (batch.syncStatus === 'processing') {
  //           await attachmentStorage.updateSyncStatus(batch.batchId, 'idle');
  //         }
  //       }
  //     } catch (error) {
  //       console.error('Error resetting sync status:', error);
  //     }
  //   };

  //   window.addEventListener('beforeunload', handleBeforeUnload);
  //   return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  // }, [organizationId]);
};
