import { type UploadResult, Uppy, type UppyFile, type UppyOptions } from '@uppy/core';
import Tus from '@uppy/tus';
import { config } from 'config';
import { getUploadToken } from '~/modules/general/api';

import { onlineManager } from '@tanstack/react-query';
import '@uppy/core/dist/style.min.css';
import { t } from 'i18next';
import { LocalFileStorage } from '~/modules/attachments/local-file-storage';
import type { UploadUppyProps } from '~/modules/attachments/upload/upload-uppy';
import { toaster } from '~/modules/common/toaster';
import { nanoid } from '~/utils/nanoid';

export type UppyMeta = { public?: boolean; contentType?: string };

export type LocalFile = UppyFile<UppyMeta, UppyBody>;

export type UploadedUppyFile = { file: LocalFile; url: string };

// biome-ignore lint/complexity/noBannedTypes: no other way to define this type
export type UppyBody = {};

export interface UploadParams {
  public: boolean;
  organizationId?: string;
}

export const readJwt = (token: string) => JSON.parse(atob(token.split('.')[1]));

export const getTusConfig = (token: string) => {
  return {
    endpoint: config.tusUrl,
    removeFingerprintOnSuccess: true,
    headers: { authorization: `Bearer ${token}` },
  };
};

interface ImadoOptions extends UploadParams {
  statusEventHandler?: {
    onFileEditorComplete?: (file: LocalFile) => void;
    onUploadStart?: (uploadId: string, files: LocalFile[]) => void;
    onError?: (error: Error) => void;
    onComplete?: (mappedResult: UploadedUppyFile[], result: UploadResult<UppyMeta, UppyBody>) => void;
    onRetryComplete?: (mappedResult: UploadedUppyFile[], localStoreIds: string[]) => void;
  };
}
/**
 * Initialize Uppy with Imado configuration. It is used to upload files to Imado using TUS or store them offline.
 *
 * @param type Personal or Organization upload
 * @param uppyOptions Uppy options
 * @param opts Imado options
 * @returns Uppy instance
 *
 * @link https://uppy.io/docs/uppy/#new-uppyoptions
 */
export async function ImadoUppy(
  type: UploadUppyProps['uploadType'],
  imageMode: NonNullable<UploadUppyProps['imageMode']>,
  uppyOptions: UppyOptions<UppyMeta, UppyBody>,
  opts: ImadoOptions = { public: false, organizationId: undefined },
): Promise<Uppy> {
  // Determine if we can upload
  const canUpload = onlineManager.isOnline() && config.has.imado;

  // Get upload token if so
  let token = '';

  if (canUpload) {
    token = (await getUploadToken(type, { public: opts.public, organizationId: opts.organizationId })) || '';
    if (!token) throw new Error('Failed to get upload token');
  }

  // Prepare files for offline storage
  const prepareFilesForOffline = async (files: { [key: string]: LocalFile }) => {
    console.warn('Files will be stored offline in indexedDB.');

    // Save to local storage files
    await LocalFileStorage.addFiles(imageMode, files);

    // Prepare successful files for manual `complete` event
    const successfulFiles = Object.values(files);
    return successfulFiles;
  };

  const onBeforeFileAdded = (file: UppyFile<UppyMeta, UppyBody>) => {
    // Simplify id and add contentType to meta
    file.id = nanoid();
    file.meta = { ...file.meta, contentType: file.type };
    return file;
  };

  const rootUrl = opts.public ? config.publicCDNUrl : config.privateCDNUrl;

  // Initialize Uppy
  const imadoUppy = new Uppy({
    ...uppyOptions,
    meta: { public: opts.public },
    onBeforeUpload: (files) => {
      if (!canUpload) {
        prepareFilesForOffline(files).then((successfulFiles) => {
          imadoUppy.emit('complete', {
            successful: successfulFiles,
            failed: [],
          });
        });

        return config.has.imado; // Block upload if no imado
      }
      return true; // Allow upload if `canUpload` is true
    },
    onBeforeFileAdded,
  })
    .use(Tus, getTusConfig(token))
    .on('files-added', () => {
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
        mappedResult = result.successful.map((file) => {
          if (!canUpload) return { file, url: file.id };
          // Case canUpload
          const { sub } = readJwt(token);
          const uploadKey = file.uploadURL?.split('/').pop();
          const url = new URL(`${rootUrl}/${sub}/${uploadKey}`);

          return { file, url: url.toString() };
        });
      }
      opts.statusEventHandler?.onComplete?.(mappedResult, result);
    })
    .on('is-offline', () => {
      if (config.has.imado) imadoUppy.pauseAll();
    })
    .on('is-online', async () => {
      if (!config.has.imado) return;
      const imadoToken = (await getUploadToken(type, { public: opts.public, organizationId: opts.organizationId })) || '';

      const files = imadoUppy.getFiles();
      imadoUppy.destroy();
      if (files.length < 1) return;

      const retryImadoUppy = new Uppy({
        ...uppyOptions,
        meta: { public: opts.public },
        onBeforeFileAdded,
      }).use(Tus, getTusConfig(imadoToken));

      const validFiles = files.map((file) => ({ ...file, name: file.name || `${file.type}-${file.id}` }));
      retryImadoUppy.addFiles(validFiles);

      retryImadoUppy.upload().then(async (result) => {
        if (!result) return;
        let mappedResult: UploadedUppyFile[] = [];

        if (result.successful && result.successful.length > 0) {
          mappedResult = result.successful.map((file) => {
            const { sub } = readJwt(imadoToken);
            const uploadKey = file.uploadURL?.split('/').pop();
            const url = new URL(`${rootUrl}/${sub}/${uploadKey}`);

            return { file, url: url.toString() };
          });

          const ids = (await LocalFileStorage.listValues()).filter(({ meta }) => meta.imageMode === imageMode).map((el) => el.id);
          for (const id of ids) await LocalFileStorage.removeFile(id);
          console.info('🗑️ Successfully uploaded files removed from IndexedDB.');

          opts.statusEventHandler?.onRetryComplete?.(mappedResult, ids);
        }
      });
    });
  return imadoUppy;
}
