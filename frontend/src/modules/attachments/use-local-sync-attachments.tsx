import { appConfig } from 'config';
import { nanoid } from 'nanoid';
import { useEffect, useRef } from 'react';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { LocalFileStorage } from '~/modules/attachments/helpers/local-file-storage';
import { parseUploadedAttachments } from '~/modules/attachments/helpers/parse-uploaded';
import { getAttachmentsCollection, getLocalAttachmentsCollection } from '~/modules/attachments/query';
import type { AttachmentToInsert } from '~/modules/attachments/types';
import { createBaseTransloaditUppy } from '~/modules/common/uploader/helpers';
import type { UploadedUppyFile } from '~/modules/common/uploader/types';

export const useLocalSyncAttachments = (organizationId: string) => {
  const { isOnline } = useOnlineManager();

  const attachmentCollection = getAttachmentsCollection(organizationId);
  const localAttachmentCollection = getLocalAttachmentsCollection(organizationId);

  const { getData: fetchStoredFiles, setSyncStatus: updateStoredFilesSyncStatus } = LocalFileStorage;

  const isSyncingRef = useRef(false); // Prevent double trigger

  const onComplete = async (attachments: AttachmentToInsert[], storedIds: string[]) => {
    const tableAttachmetns = attachments.map((a) => {
      const optimisticId = a.id || nanoid();
      const groupId = attachments.length > 1 ? nanoid() : null;

      return {
        id: optimisticId,
        filename: a.filename,
        name: a.filename.split('.').slice(0, -1).join('.'),
        content_type: a.contentType,
        size: a.size,
        original_key: a.originalKey,
        thumbnail_key: a.thumbnailKey ?? null,
        converted_key: a.convertedKey ?? null,
        converted_content_type: a.convertedContentType ?? null,
        entity_type: 'attachment' as const,
        created_at: new Date().toISOString(),
        created_by: null,
        modified_at: null,
        modified_by: null,
        group_id: groupId,
        organization_id: organizationId,
      };
    });

    attachmentCollection.insert(tableAttachmetns, { metadata: { attachments } });

    // Clean up offline files from IndexedDB
    localAttachmentCollection.delete(storedIds);
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
};
