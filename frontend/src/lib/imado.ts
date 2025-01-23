import { type UploadResult, Uppy, type UppyFile, type UppyOptions } from '@uppy/core';
import Tus from '@uppy/tus';
import { config } from 'config';
import { getUploadToken } from '~/modules/general/api';
import type { UploadParams, UploadType, UploadedUppyFile } from '~/types/common';

import '@uppy/core/dist/style.min.css';
import { onlineManager } from '@tanstack/react-query';
import { LocalFileStorage } from '~/modules/attachments/local-file-storage';
import { nanoid } from '~/utils/nanoid';

export type UppyMeta = { public?: boolean; contentType?: string };
export type LocalFile = UppyFile<UppyMeta, UppyBody>;

// biome-ignore lint/complexity/noBannedTypes: no other way to define this type
export type UppyBody = {};

const readJwt = (token: string) => JSON.parse(atob(token.split('.')[1]));

interface ImadoUploadParams extends UploadParams {
  statusEventHandler?: {
    onFileEditorComplete?: (file: UppyFile<UppyMeta, UppyBody>) => void;
    onUploadStart?: (uploadId: string, files: UppyFile<UppyMeta, UppyBody>[]) => void;
    onError?: (error: Error) => void;
    onComplete?: (mappedResult: UploadedUppyFile[], result: UploadResult<UppyMeta, UppyBody>) => void;
  };
}

export async function ImadoUppy(
  type: UploadType,
  uppyOptions: UppyOptions<UppyMeta, UppyBody>,
  opts: ImadoUploadParams = { public: false, organizationId: undefined },
): Promise<Uppy> {
  const canUpload = onlineManager.isOnline() && config.has.imado;

  // Get upload token
  let token = '';

  if (canUpload) {
    token = (await getUploadToken(type, { public: opts.public, organizationId: opts.organizationId })) || '';
    if (!token) throw new Error('Failed to get upload token');
  }

  const prepareFilesForOffline = async (files: { [key: string]: UppyFile<UppyMeta, UppyBody> }) => {
    console.warn('Files will be stored offline in indexedDB.');

    // Save files to local storage asynchronously
    await LocalFileStorage.addFiles(files);

    // Prepare successful files for manual `complete` event
    const successfulFiles = Object.values(files);
    return successfulFiles;
  };

  // Initialize Uppy
  const imadoUppy = new Uppy({
    ...uppyOptions,
    meta: {
      public: opts.public,
    },
    onBeforeUpload: (files) => {
      if (!canUpload) {
        prepareFilesForOffline(files).then((successfulFiles) => {
          imadoUppy.emit('complete', {
            successful: successfulFiles,
            failed: [],
          });
        });

        return false; // Block the upload
      }

      return true; // Allow upload if `canUpload` is true
    },
    onBeforeFileAdded: (file) => {
      // Simplify id and add contentType to meta
      file.id = nanoid();
      file.meta = {
        ...file.meta,
        contentType: file.type,
      };
      return file;
    },
  })
    .use(Tus, {
      endpoint: config.tusUrl,
      removeFingerprintOnSuccess: true,
      headers: {
        authorization: `Bearer ${token}`,
      },
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

      if (result.successful && canUpload) {
        mappedResult = result.successful.map((file) => {
          const rootUrl = opts.public ? config.publicCDNUrl : config.privateCDNUrl;
          const { sub } = readJwt(token);
          const uploadKey = file.uploadURL?.split('/').pop();
          const url = new URL(`${rootUrl}/${sub}/${uploadKey}`);
          return { file, url: url.toString() };
        });
      } else if (result.successful && !canUpload) {
        mappedResult = result.successful.map((file) => {
          return { file, url: file.id };
        });
      }
      opts.statusEventHandler?.onComplete?.(mappedResult, result);
    });

  return imadoUppy;
}
