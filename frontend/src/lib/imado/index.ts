import '@uppy/core/dist/style.min.css';

import { onlineManager } from '@tanstack/react-query';
import type { Uppy, UppyOptions } from '@uppy/core';
import type { AssemblyResponse } from '@uppy/transloadit';
import { type UploadTemplateId, config } from 'config';
import { t } from 'i18next';
import { createBaseTransloaditUppy, prepareFilesForOffline } from '~/lib/imado/helpers';
import type { ImadoOptions, UploadTokenData, UploadedUppyFile, UppyBody, UppyMeta } from '~/lib/imado/types';
import { LocalFileStorage } from '~/modules/attachments/local-file-storage';
import type { UploadUppyProps } from '~/modules/attachments/upload/upload-uppy';
import { toaster } from '~/modules/common/toaster';
import { getUploadToken } from '~/modules/me/api';
import { cleanFileName } from '~/utils/clean-file-name';

/**
 * Initialize Uppy with Imado configuration.
 * This function uploads files using TUS or stores them offline.
 *
 * @param type - Upload type, either personal or organization
 * @param templateId - Image mode specifying how the file should be treated
 * @param uppyOptions - Options to configure the Uppy instance
 * @param opts - Imado-specific configuration, including public or organization upload settings
 * @returns A Promise resolving to an initialized Uppy instance
 */
export async function ImadoUppy(
  type: UploadUppyProps['uploadType'],
  uppyOptions: UppyOptions<UppyMeta, UppyBody>,
  opts: ImadoOptions,
): Promise<Uppy> {
  // Determine if we can upload based on online status and Imado configuration
  const canUpload = onlineManager.isOnline() && config.has.imado;
  const isPublic = opts.public;

  // Variable to store the upload token
  let token: UploadTokenData | undefined;

  if (canUpload) {
    token = (await getUploadToken(type, opts.templateId, { public: isPublic, organizationId: opts.organizationId })) as UploadTokenData;
    if (!token) throw new Error('Failed to get upload token');
  }

  const imadoUppy = createBaseTransloaditUppy(
    {
      ...uppyOptions,
      onBeforeUpload: (files) => {
        // Clean up file names
        for (const file of Object.values(files)) {
          const cleanName = cleanFileName(file.name || 'file');
          file.name = cleanName;
          file.meta.name = cleanName;
        }

        if (canUpload) return true;
        // If not online, prepare the files for offline storage and emit transloadit:complete event
        prepareFilesForOffline(files, opts.templateId).then((assembly) => imadoUppy.emit('transloadit:complete', assembly));
        return config.has.imado; // Prevent upload if Imado is unavailable
      },
    },
    token,
    isPublic,
    canUpload,
  )
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
    .on('transloadit:complete', (assembly: AssemblyResponse) => {
      console.info('Upload complete:', assembly);

      if (assembly.error) {
        console.warn('No successful uploads');
        return;
      }

      // Notify the event handler when upload is complete
      opts.statusEventHandler?.onComplete?.(assembly.results as UploadedUppyFile<UploadTemplateId>);
    })
    // TODO review this
    .on('is-online', async () => {
      // When back online, retry uploads
      if (!config.has.imado) return;

      // Get files that was uploaded during offline
      const offlineUploadedFiles = imadoUppy.getFiles().filter((el) => el.meta.offlineUploaded);
      if (!offlineUploadedFiles.length) return;

      // Get a new upload token
      const imadoToken = await getUploadToken(type, opts.templateId, { public: isPublic, organizationId: opts.organizationId });
      if (!imadoToken) return;

      imadoUppy.destroy(); // Destroy the current Uppy instance to restart

      // Initialize a new Uppy instance to retry the upload
      const retryImadoUppy = createBaseTransloaditUppy(uppyOptions, imadoToken, isPublic);

      // Add files to the new Uppy instance
      const validFiles = offlineUploadedFiles.map((file) => ({ ...file, name: file.name || `${file.type}-${file.id}` }));
      retryImadoUppy.addFiles(validFiles);

      // Upload the files
      retryImadoUppy.upload().then(async (result) => {
        if (!result || !('transloadit' in result)) return;

        const transloadits = result.transloadit as AssemblyResponse[];
        const assembly = transloadits[0];
        if (assembly.error) return;

        // Clean up offline files from IndexedDB
        const ids = offlineUploadedFiles.map((el) => el.id);
        await LocalFileStorage.removeFiles(ids);
        console.info('🗑️ Successfully uploaded files removed from IndexedDB.');

        // Notify the event handler for retry completion
        opts.statusEventHandler?.onRetrySuccess?.(assembly.results as UploadedUppyFile<UploadTemplateId>, ids);
      });
    });

  return imadoUppy; // Return the configured Uppy instance
}
