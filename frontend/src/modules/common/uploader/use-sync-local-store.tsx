import { useEffect } from 'react';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { parseUploadedAttachments } from '~/modules/attachments/helpers';
import { LocalFileStorage } from '~/modules/attachments/local-file-storage';
import { useAttachmentCreateMutation, useAttachmentDeleteMutation } from '~/modules/attachments/query/mutations';
import type { AttachmentToInsert } from '~/modules/attachments/types';
import { createBaseTransloaditUppy } from '~/modules/common/uploader/helpers';
import type { UploadedUppyFile } from '~/modules/common/uploader/types';

export function useSyncLocalStore(organizationId: string) {
  const { isOnline } = useOnlineManager();
  const { mutate: createAttachments } = useAttachmentCreateMutation();
  const { mutate: deleteAttachments } = useAttachmentDeleteMutation();

  const onComplete = (attachments: AttachmentToInsert[], storedIds: string[]) => {
    createAttachments({ attachments, orgIdOrSlug: organizationId });
    deleteAttachments({ orgIdOrSlug: organizationId, ids: storedIds });
  };

  useEffect(() => {
    if (!isOnline) return;

    const syncStoreAttachments = async () => {
      const storageData = await LocalFileStorage.getData(organizationId);

      if (!storageData) return;

      const files = Object.values(storageData.files);
      try {
        const localUppy = await createBaseTransloaditUppy(
          {
            restrictions: {
              maxFileSize: 10 * 1024 * 1024, // 10MB
              maxNumberOfFiles: 20,
              allowedFileTypes: ['.jpg', '.jpeg', '.png'],
              maxTotalFileSize: 100 * 1024 * 1024, // 100MB
              minFileSize: null,
              minNumberOfFiles: null,
              requiredMetaFields: [],
            },
          },
          storageData.tokenQuery,
        );

        localUppy
          .on('error', (err) => {
            console.error('Sync files upload error:', err);
          })
          .on('upload', () => {
            console.log('Sync files upload started');
          })
          .on('transloadit:complete', async (assembly) => {
            if (assembly.error) throw new Error(assembly.error);
            const attachments = parseUploadedAttachments(assembly.results as UploadedUppyFile<'attachment'>, organizationId);

            const ids = files.map(({ id }) => id);
            onComplete(attachments, ids);
            // Clean up offline files from IndexedDB
            await LocalFileStorage.removeData(organizationId);
            console.info('🗑️ Successfully uploaded files removed from IndexedDB.');
          });

        for (const file of files) localUppy.addFile({ ...file, name: file.name || `${file.type}-${file.id}` });

        await localUppy.upload();
      } catch (err) {}
    };

    syncStoreAttachments();
  }, [isOnline]);
}
