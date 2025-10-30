import { appConfig } from 'config';
import { useEffect, useRef } from 'react';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { LocalFileStorage } from '~/modules/attachments/helpers/local-file-storage';
import { parseUploadedAttachments } from '~/modules/attachments/helpers/parse-uploaded';
import { useAttachmentCreateMutation, useAttachmentDeleteMutation } from '~/modules/attachments/query-mutations';
import type { AttachmentToInsert } from '~/modules/attachments/types';
import { createBaseTransloaditUppy } from '~/modules/common/uploader/helpers';
import type { UploadedUppyFile } from '~/modules/common/uploader/types';

// TODO(DAVID)(improvement) make uploaded attachment naming right, if it was changed during offline update it on upload
export const useLocalSyncAttachments = (organizationId: string) => {
  const { isOnline } = useOnlineManager();
  const { mutate: createAttachments } = useAttachmentCreateMutation();
  const { mutate: deleteAttachments } = useAttachmentDeleteMutation();
  const { getData: fetchStoredFiles, setSyncStatus: updateStoredFilesSyncStatus } = LocalFileStorage;

  const isSyncingRef = useRef(false); // Prevent double trigger

  const onComplete = (attachments: AttachmentToInsert[], storedIds: string[]) => {
    createAttachments(
      { localCreation: false, attachments, orgIdOrSlug: organizationId },
      { onSuccess: () => console.info('Successfully synced attachments to server:', attachments) },
    );
    // Clean up offline files from IndexedDB
    deleteAttachments(
      { localDeletionIds: storedIds, serverDeletionIds: [], orgIdOrSlug: organizationId },
      { onSuccess: () => console.info('Successfully removed uploaded files from IndexedDB.') },
    );
  };

  useEffect(() => {
    if (!isOnline || isSyncingRef.current || !appConfig.has.uploadEnabled) return;

    const syncStoreAttachments = async () => {
      isSyncingRef.current = true;
      const storageData = await fetchStoredFiles(organizationId);

      if (!storageData || storageData.syncStatus !== 'idle') {
        isSyncingRef.current = false;
        return;
      }

      const files = Object.values(storageData.files);
      if (!files.length) {
        isSyncingRef.current = false;
        return;
      }

      try {
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
          storageData.tokenQuery,
        );

        localUppy
          .on('error', async (err) => {
            console.error('Sync files upload error:', err);
            await updateStoredFilesSyncStatus(organizationId, 'idle');
            isSyncingRef.current = false;
          })
          .on('upload', async () => {
            console.info('Sync files upload started');
            await updateStoredFilesSyncStatus(organizationId, 'processing');
          })
          .on('transloadit:complete', async (assembly) => {
            if (assembly.error) throw new Error(assembly.error);
            const attachments = parseUploadedAttachments(assembly.results as UploadedUppyFile<'attachment'>, organizationId);

            const ids = files.map(({ id }) => id);
            onComplete(attachments, ids);
            isSyncingRef.current = false;
          });

        for (const file of files) {
          // TODO Ensure `data` is non-null to satisfy Uppy types: fall back to a size-only object when missing.
          const data = file.data ?? { size: file.size ?? null };
          localUppy.addFile({ ...file, name: file.name || `${file.type}-${file.id}`, data });
        }

        await localUppy.upload();
      } catch (err) {
        isSyncingRef.current = false;
      }
    };

    syncStoreAttachments();
  }, [isOnline]);

  // Ensures that any in-progress sync is marked as idle, so the next page load can correctly start syncing again.
  useEffect(() => {
    const handleBeforeUnload = async () => await updateStoredFilesSyncStatus(organizationId, 'idle');
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);
};
