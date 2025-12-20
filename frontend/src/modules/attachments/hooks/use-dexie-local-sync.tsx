import { useLoaderData } from '@tanstack/react-router';
import { appConfig } from 'config';
import { useEffect, useRef, useState } from 'react';
import { useOnlineManager } from '~/hooks/use-online-manager';
import type { AttachmentFile } from '~/modules/attachments/dexie/attachment-db';
import { attachmentStorage } from '~/modules/attachments/dexie/storage-service';
import { parseUploadedAttachments } from '~/modules/attachments/helpers';
import { createBaseTransloaditUppy } from '~/modules/common/uploader/helpers';
import type { CustomUppy, CustomUppyFile, UploadedUppyFile } from '~/modules/common/uploader/types';
import type { UploadTokenQuery } from '~/modules/me/types';
import { OrganizationAttachmentsRoute } from '~/routes/organization-routes';

// TODO(DAVID)(improvement) make uploaded attachment naming right, if it was changed during offline update it on upload
export const useDexieLocalSync = (organizationId: string) => {
  const { isOnline } = useOnlineManager();
  const { attachmentsCollection } = useLoaderData({ from: OrganizationAttachmentsRoute.id });

  const isSyncingRef = useRef(false); // Prevent double trigger
  const [syncState, setSyncState] = useState({
    isSyncing: false,
    pendingFiles: 0,
    failedFiles: 0,
    lastSyncTime: null as Date | null,
  });

  useEffect(() => {
    if (!isOnline || isSyncingRef.current || !appConfig.has.uploadEnabled) return;

    const syncStoreAttachments = async () => {
      isSyncingRef.current = true;
      setSyncState((prev) => ({ ...prev, isSyncing: true }));

      try {
        // Get files that need syncing
        const filesNeedingSync = await attachmentStorage.getFilesNeedingSync(organizationId);
        const failedFiles = filesNeedingSync.filter((f) => f.syncStatus === 'failed').length;

        setSyncState((prev) => ({
          ...prev,
          pendingFiles: filesNeedingSync.length,
          failedFiles,
        }));

        if (!filesNeedingSync.length) {
          isSyncingRef.current = false;
          setSyncState((prev) => ({ ...prev, isSyncing: false }));
          return;
        }

        // Group files by tokenQuery to handle different upload sessions
        const batchesByToken = filesNeedingSync.reduce(
          (acc, file) => {
            const tokenKey = JSON.stringify(file.tokenQuery);
            if (!acc[tokenKey]) {
              acc[tokenKey] = {
                tokenQuery: file.tokenQuery,
                files: [],
                batchRecords: [],
              };
            }
            acc[tokenKey].files.push(...Object.values(file.files));
            acc[tokenKey].batchRecords.push(file);
            return acc;
          },
          {} as Record<
            string,
            { tokenQuery: UploadTokenQuery; files: CustomUppyFile[]; batchRecords: AttachmentFile[] }
          >,
        );

        // Process each batch separately
        for (const batch of Object.values(batchesByToken)) {
          let batchUppy: CustomUppy | null = null;

          try {
            batchUppy = await createBaseTransloaditUppy(
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
              batch.tokenQuery,
            );

            batchUppy
              .on('error', async (err: Error) => {
                console.error('Sync files upload error for batch:', err);
                // Mark all files in this batch for retry
                for (const record of batch.batchRecords) {
                  await attachmentStorage.markFileForRetry(record.id);
                }
                if (batchUppy) {
                  batchUppy.cancelAll();
                  batchUppy.destroy();
                }
              })
              .on('upload', async () => {
                console.info('Sync files upload started for batch:', organizationId);
                // Mark all files in this batch as processing
                await attachmentStorage.updateFilesSyncStatus(organizationId, 'processing');
              })
              .on('transloadit:complete', async (assembly: any) => {
                if (assembly.error) throw new Error(assembly.error);
                const attachments = parseUploadedAttachments(
                  assembly.results as UploadedUppyFile<'attachment'>,
                  organizationId,
                );

                attachmentsCollection.insert(attachments);
                console.info('Successfully synced attachments to server:', attachments);

                // Clean up offline files from Dexie for this batch
                await attachmentStorage.removeFiles(batch.batchRecords);
                console.info('Successfully removed uploaded files from Dexie for batch.');

                // Update sync state
                setSyncState((prev) => ({
                  ...prev,
                  pendingFiles: Math.max(0, prev.pendingFiles - batch.batchRecords.length),
                  lastSyncTime: new Date(),
                }));
              });

            // Add validated files to Uppy
            for (const uppyFile of batch.files) {
              if (!uppyFile.data && !uppyFile.size) {
                console.warn('Invalid file data, skipping:', uppyFile.id);
                continue;
              }

              const data = uppyFile.data ?? { size: uppyFile.size ?? null };
              batchUppy.addFile({
                ...uppyFile,
                name: uppyFile.name || `${uppyFile.type}-${uppyFile.id}`,
                data,
              });
            }

            await batchUppy.upload();
            batchUppy.destroy();
          } catch (error) {
            console.error('Batch sync failed:', error);
            // Mark all files in this batch for retry
            for (const record of batch.batchRecords) {
              await attachmentStorage.markFileForRetry(record.id);
            }
            if (batchUppy) {
              batchUppy.cancelAll();
              batchUppy.destroy();
            }
          }
        }
      } catch (error) {
        console.error('Sync files upload failed:', error);
        await attachmentStorage.updateFilesSyncStatus(organizationId, 'failed');
      } finally {
        isSyncingRef.current = false;
        setSyncState((prev) => ({ ...prev, isSyncing: false }));
      }
    };

    syncStoreAttachments();
  }, [isOnline, organizationId, attachmentsCollection]);

  // Ensures that any in-progress sync is marked as idle, so the next page load can correctly start syncing again.
  useEffect(() => {
    const handleBeforeUnload = async () => {
      try {
        const batchesNeedingSync = await attachmentStorage.getFilesNeedingSync(organizationId);
        for (const batch of batchesNeedingSync) {
          if (batch.syncStatus === 'processing') {
            await attachmentStorage.markFileForRetry(batch.id);
          }
        }
      } catch (error) {
        console.error('Error resetting sync status:', error);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [organizationId]);

  return syncState;
};
