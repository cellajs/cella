import { Uppy } from '@uppy/core';
import Tus from '@uppy/tus';
import { config } from 'config';
import { getTusConfig, readJwt } from '~/lib/imado';
import { LocalFileStorage } from '~/modules/attachments/local-file-storage';
import { getUploadToken } from '~/modules/general/api';

/**
 * Sync offline-stored files in IndexedDB to the cloud when the user is online.
 */
export async function syncOfflineFiles() {
  if (!config.has.imado) return;

  try {
    // Retrieve and reconstruct files
    const imadoRetryData = await LocalFileStorage.getRetryOptions();
    if (!imadoRetryData || imadoRetryData.length < 1) return;

    for (const imadoRetry of imadoRetryData) {
      const { options, fileMap } = imadoRetry;

      const files = Object.values(fileMap);
      const filesIds = Object.keys(fileMap);

      const token = await getUploadToken(options.type, { public: options.meta?.public || false, organizationId: options.organizationId });

      // Validate token format
      if (!token) return console.error('Invalid JWT format:', token);

      const uppy = new Uppy(options).use(Tus, getTusConfig(token));

      for (const file of files) {
        try {
          uppy.addFile({ ...file, name: file.name || `${file.type}-${file.id}` });
        } catch (error) {
          console.error(`Failed to add ${file.name}:`, error);
        }
      }

      const rootUrl = options.meta?.public ? config.publicCDNUrl : config.privateCDNUrl;
      const { sub } = readJwt(token);

      uppy.upload().then((result) => {
        const results =
          result?.successful?.map((file, index) => {
            const uploadKey = file.uploadURL?.split('/').pop();
            const url = new URL(`${rootUrl}/${sub}/${uploadKey}`);
            return { url: url.toString(), id: filesIds[index] };
          }) ?? [];

        if (results.length > 0) {
          LocalFileStorage.clearAll();

          // TODO update DB URLs
          console.info('🗑️ Successfully uploaded files removed from IndexedDB.');
        }
      });
    }
  } catch (error) {
    console.error('Error syncing offline files:', error);
  }
}
