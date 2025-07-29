import { config } from 'config';
import { useEffect, useRef } from 'react';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { LocalFileStorage } from '~/modules/attachments/helpers/local-file-storage';
import { parseUploadedAttachments } from '~/modules/attachments/helpers/parse-uploaded';
import { useAttachmentCreateMutation, useAttachmentDeleteMutation } from '~/modules/attachments/query-mutations';
import type { AttachmentToInsert } from '~/modules/attachments/types';
import { createBaseTransloaditUppy } from '~/modules/common/uploader/helpers';
import type { UploadedUppyFile } from '~/modules/common/uploader/types';

export function useSyncLocalStore(organizationId: string) {
  const { isOnline } = useOnlineManager();
  const { mutate: createAttachments } = useAttachmentCreateMutation();
  const { mutate: deleteAttachments } = useAttachmentDeleteMutation();
  const { getData: fetchStoredFiles, removeData: deleteStoredFiles, setSyncStatus: updateStoredFilesSyncStatus } = LocalFileStorage;

  const isSyncingRef = useRef(false); // Prevent double trigger

  const onComplete = (attachments: AttachmentToInsert[], storedIds: string[]) => {
    createAttachments({ attachments, orgIdOrSlug: organizationId });
    deleteAttachments({ orgIdOrSlug: organizationId, ids: storedIds });
  };

  useEffect(() => {
    if (!isOnline || !config.has.uploadEnabled) return;
    if (isSyncingRef.current) return; // Skip if already syncing

    const syncStoreAttachments = async () => {
      isSyncingRef.current = true;
      const storageData = await fetchStoredFiles(organizationId);

      if (!storageData || storageData.syncStatus !== 'idle') return;

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
            // Clean up offline files from IndexedDB
            await deleteStoredFiles(organizationId);
            console.info('🗑️ Successfully uploaded files removed from IndexedDB.');
            isSyncingRef.current = false;
          });

        for (const file of files) localUppy.addFile({ ...file, name: file.name || `${file.type}-${file.id}` });

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
}
