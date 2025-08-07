import type { Collection } from '@tanstack/react-db';
import { appConfig } from 'config';
import { t } from 'i18next';
import { nanoid } from 'nanoid';
import { useEffect, useRef } from 'react';
import { createAttachment } from '~/api.gen';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { LocalFileStorage } from '~/modules/attachments/helpers/local-file-storage';
import { parseUploadedAttachments } from '~/modules/attachments/helpers/parse-uploaded';
import type { AttachmentToInsert, LiveQueryAttachment } from '~/modules/attachments/types';
import { createBaseTransloaditUppy } from '~/modules/common/uploader/helpers';
import type { UploadedUppyFile } from '~/modules/common/uploader/types';
import { toaster } from '../common/toaster';
import { useTransaction } from './use-transaction';

export const useLocalSyncAttachments = (organizationId: string, attachmentCollection: Collection<LiveQueryAttachment>) => {
  const { isOnline } = useOnlineManager();

  const deleteAttachmens = useTransaction<LiveQueryAttachment[]>({
    mutationFn: async ({ transaction }) => {
      const ids: string[] = [];
      for (const { changes } of transaction.mutations) {
        if (changes && 'id' in changes && typeof changes.id === 'string') ids.push(changes.id);
      }
      await LocalFileStorage.removeFiles(ids);
      console.info('Successfully removed uploaded files from IndexedDB.');
    },
  });

  const createAttachmens = useTransaction<LiveQueryAttachment>({
    mutationFn: async ({ transaction }) => {
      const { orgIdOrSlug, attachments } = transaction.metadata as { orgIdOrSlug: string; attachments: (AttachmentToInsert & { id: string })[] };
      try {
        await createAttachment({ body: attachments, path: { orgIdOrSlug } });
      } catch {
        toaster(t('error:create_resource', { resource: t('common:attachment') }), 'error');
      }
    },
  });
  const { getData: fetchStoredFiles, setSyncStatus: updateStoredFilesSyncStatus } = LocalFileStorage;

  const isSyncingRef = useRef(false); // Prevent double trigger

  const onComplete = (attachments: AttachmentToInsert[], storedIds: string[]) => {
    createAttachmens.mutate(() => {
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

      createAttachmens.metadata = { orgIdOrSlug: organizationId, attachments };
      attachmentCollection.insert(tableAttachmetns);
    });
    // TODO(tanstack DB) error CollectionOperationError: Collection.delete was called with key '78vw8i2yip89bsgc6xp7o' but there is no item in the collection with this key
    // Clean up offline files from IndexedDB
    deleteAttachmens.mutate(() => attachmentCollection.delete(storedIds));
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
