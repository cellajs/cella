import type { AssemblyResponse } from '@uppy/transloadit';
import { config } from 'config';
import { useEffect } from 'react';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { parseUploadedAttachments } from '~/modules/attachments/helpers';
import { LocalFileStorage } from '~/modules/attachments/local-file-storage';
import { useAttachmentCreateMutation, useAttachmentDeleteMutation } from '~/modules/attachments/query/mutations';
import { createBaseTransloaditUppy } from '~/modules/common/uploader/helpers';
import type { UploadedUppyFile } from '~/modules/common/uploader/types';

export function useSyncLocalStore(organizationId: string) {
  const { isOnline } = useOnlineManager();
  const { mutate: createAttachments } = useAttachmentCreateMutation();
  const { mutate: deleteAttachments } = useAttachmentDeleteMutation();

  const onComplete = (result: UploadedUppyFile<'attachment'>, storedIds: string[]) => {
    const attachments = parseUploadedAttachments(result, organizationId);
    createAttachments({ attachments, orgIdOrSlug: organizationId });
    deleteAttachments({ orgIdOrSlug: organizationId, ids: storedIds });
  };

  useEffect(() => {
    if (!isOnline) return;

    const syncStoreAttachments = async () => {
      const storageData = await LocalFileStorage.getData(organizationId);

      if (!storageData) return;

      try {
        const localUppy = await createBaseTransloaditUppy(
          {
            restrictions: {
              ...config.uppy.defaultRestrictions,
              minFileSize: null,
              minNumberOfFiles: null,
              requiredMetaFields: [],
            },
          },
          storageData.tokenQuery,
        );

        // Add files to the new Uppy instance
        const validFiles = Object.values(storageData.files).map((file) => ({ ...file, name: file.name || `${file.type}-${file.id}` }));
        localUppy.addFiles(validFiles);
        localUppy.upload().then(async (result) => {
          if (!result || !('transloadit' in result)) throw new Error('IndexedDB files don`t sync');

          const transloadits = result.transloadit as AssemblyResponse[];
          const assembly = transloadits[0];
          if (assembly.error) throw new Error(assembly.error);

          // Clean up offline files from IndexedDB
          await LocalFileStorage.removeData(organizationId);
          console.info('🗑️ Successfully uploaded files removed from IndexedDB.');

          const ids = validFiles.map(({ id }) => id);
          onComplete(assembly.results as UploadedUppyFile<'attachment'>, ids);
        });
      } catch (err) {}
    };

    syncStoreAttachments();
  }, [isOnline]);
}
