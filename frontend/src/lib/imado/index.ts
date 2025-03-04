import { onlineManager } from '@tanstack/react-query';
import { type UploadResult, Uppy, type UppyFile, type UppyOptions } from '@uppy/core';
import Tus from '@uppy/tus';
import { config } from 'config';
import { t } from 'i18next';

import type { ImadoOptions, LocalFile, UploadedUppyFile, UppyBody, UppyMeta } from '~/lib/imado/types';
import { LocalFileStorage } from '~/modules/attachments/local-file-storage';
import type { UploadUppyProps } from '~/modules/attachments/upload/upload-uppy';
import { toaster } from '~/modules/common/toaster';
import { getUploadToken } from '~/modules/general/api';
import { nanoid } from '~/utils/nanoid';

import '@uppy/core/dist/style.min.css';

/**
 * Initialize Uppy with Imado configuration.
 * This function uploads files using TUS or stores them offline.
 *
 * @param type - Upload type, either personal or organization
 * @param imageMode - Image mode specifying how the file should be treated
 * @param uppyOptions - Options to configure the Uppy instance
 * @param opts - Imado-specific configuration, including public or organization upload settings
 * @returns A Promise resolving to an initialized Uppy instance
 */
export async function ImadoUppy(
  type: UploadUppyProps['uploadType'],
  imageMode: NonNullable<UploadUppyProps['imageMode']>,
  uppyOptions: UppyOptions<UppyMeta, UppyBody>,
  opts: ImadoOptions = { public: false, organizationId: undefined },
): Promise<Uppy> {
  // Determine if we can upload based on online status and Imado configuration
  const canUpload = onlineManager.isOnline() && config.has.imado;

  // Variable to store the upload token
  let token = '';

  if (canUpload) {
    token = (await getUploadToken(type, { public: opts.public, organizationId: opts.organizationId })) || '';
    if (!token) throw new Error('Failed to get upload token');
  }

  /**
   * Prepare files for offline storage in IndexedDB.
   * This function saves the files in IndexedDB when the user is offline.
   */
  const prepareFilesForOffline = async (files: { [key: string]: LocalFile }) => {
    console.warn('Files will be stored offline in indexedDB.');

    // Save files to local storage
    await LocalFileStorage.addFiles(imageMode, files);

    // Prepare files for a manual 'complete' event (successfully uploaded files)
    const successfulFiles = Object.values(files);
    return successfulFiles;
  };

  const onBeforeFileAdded = (file: UppyFile<UppyMeta, UppyBody>) => {
    // Simplify file ID and add content type to the meta
    file.id = nanoid();
    file.meta = { ...file.meta, contentType: file.type };
    return file;
  };

  // Initialize the Uppy instance
  const imadoUppy = new Uppy({
    ...uppyOptions,
    meta: { public: opts.public },
    onBeforeUpload: (files) => {
      if (!canUpload) {
        // If not online, prepare the files for offline storage and emit complete event
        prepareFilesForOffline(files).then((successfulFiles) => {
          imadoUppy.emit('complete', {
            successful: successfulFiles,
            failed: [],
          });
        });

        return config.has.imado; // Prevent upload if Imado is unavailable
      }
      return true; // Allow upload if `canUpload` is true
    },
    onBeforeFileAdded,
  })
    .use(Tus, getTusConfig(token))
    .on('files-added', () => {
      // Show warning if the user is online but Imado is not available
      if (onlineManager.isOnline() && !config.has.imado) toaster(t('common:file_upload_warning'), 'warning');
    })
    .on('file-editor:complete', (file) => {
      console.info('File editor complete:', file);
      opts.statusEventHandler?.onFileEditorComplete?.(file);
    })
    .on('upload', (uploadId, files) => {
      console.info('Upload started:', files);
      opts.statusEventHandler?.onUploadStart?.(uploadId, files);
    })
    .on('error', (error) => {
      console.error('Upload error:', error);
      opts.statusEventHandler?.onError?.(error);
    })
    .on('complete', (result: UploadResult<UppyMeta, UppyBody>) => {
      console.info('Upload complete:', result);

      let mappedResult: UploadedUppyFile[] = [];

      if (result.successful && result.successful.length > 0) {
        // Map successful files to a URL and file object
        mappedResult = result.successful.map((file) => {
          if (!canUpload) return { file, url: file.id }; // Handle offline uploads

          // Generate URL for successful file upload
          return transformUploadedFile(file, token, opts.public);
        });
      }
      // Notify event handler when upload is complete
      opts.statusEventHandler?.onComplete?.(mappedResult, result);
    })
    .on('is-offline', () => {
      // Pause all uploads when user goes offline if imado is enabled
      if (config.has.imado) imadoUppy.pauseAll();
    })
    .on('is-online', async () => {
      // When back online, retry uploads
      if (!config.has.imado) return;

      // Get a new upload token
      const imadoToken = (await getUploadToken(type, { public: opts.public, organizationId: opts.organizationId })) || '';

      const files = imadoUppy.getFiles();
      imadoUppy.destroy(); // Destroy the current Uppy instance to restart

      if (files.length < 1) return;

      // Initialize a new Uppy instance to retry the upload
      const retryImadoUppy = new Uppy({
        ...uppyOptions,
        meta: { public: opts.public },
        onBeforeFileAdded,
      }).use(Tus, getTusConfig(imadoToken));

      // Add files to the new Uppy instance
      const validFiles = files.map((file) => ({ ...file, name: file.name || `${file.type}-${file.id}` }));
      retryImadoUppy.addFiles(validFiles);

      // Upload the files
      retryImadoUppy.upload().then(async (result) => {
        if (!result || !result.successful || result.successful.length < 1) return;

        // Map the successful files and remove them from offline storage
        const mappedResult = result.successful.map((file) => transformUploadedFile(file, imadoToken, opts.public));

        // Clean up offline files from IndexedDB
        const ids = (await LocalFileStorage.listValues()).filter(({ meta }) => meta.imageMode === imageMode).map((el) => el.id);
        await LocalFileStorage.removeFiles(ids);
        console.info('🗑️ Successfully uploaded files removed from IndexedDB.');

        // Notify the event handler for retry completion
        opts.statusEventHandler?.onRetryComplete?.(mappedResult, ids);
      });
    });

  return imadoUppy; // Return the configured Uppy instance
}

// Helper functions
const readJwt = (token: string) => JSON.parse(atob(token.split('.')[1]));

const getTusConfig = (token: string) => ({
  endpoint: config.tusUrl,
  removeFingerprintOnSuccess: true,
  headers: { authorization: `Bearer ${token}` },
});

const transformUploadedFile = (file: UppyFile<UppyMeta, UppyBody>, token: string, isPublic: boolean) => {
  // Define the root URL for the uploaded files (public or private CDN)
  const rootUrl = isPublic ? config.publicCDNUrl : config.privateCDNUrl;
  const { sub } = readJwt(token);
  const uploadKey = file.uploadURL?.split('/').pop();
  const url = new URL(`${rootUrl}/${sub}/${uploadKey}`);

  return { file, url: url.toString() };
};
