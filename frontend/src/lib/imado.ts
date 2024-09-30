import { type UploadResult, Uppy, type UppyFile, type UppyOptions } from '@uppy/core';
import Tus from '@uppy/tus';
import { config } from 'config';
import { getUploadToken } from '~/api/general';
import type { UploadParams, UploadType } from '~/types/common';

import '@uppy/core/dist/style.min.css';

export type UppyMeta = { public?: boolean };
// biome-ignore lint/complexity/noBannedTypes: no other way to define this type
export type UppyBody = {};

const readJwt = (token: string) => JSON.parse(atob(token.split('.')[1]));

interface ImadoUploadParams extends UploadParams {
  statusEventHandler?: {
    onFileEditorComplete?: (data: UppyFile<UppyMeta, UppyBody>) => void;
    onUploadStart?: (data: string) => void;
    onError?: (error: Error) => void;
    onComplete?: (mappedResult: { file: UppyFile<UppyMeta, UppyBody>; url: string }[], result: UploadResult<UppyMeta, UppyBody>) => void;
  };
}

export async function ImadoUppy(
  type: UploadType,
  uppyOptions: UppyOptions<UppyMeta, UppyBody>,
  opts: ImadoUploadParams = { public: false, organizationId: undefined },
): Promise<Uppy> {
  const token = await getUploadToken(type, { public: opts.public, organizationId: opts.organizationId });

  if (!token) throw new Error('Failed to get upload token');

  const { public: isPublic, sub, imado: useImadoAPI } = readJwt(token);

  const rootUrl = isPublic ? config.publicCDNUrl : config.privateCDNUrl;

  const imadoUppy = new Uppy({
    ...uppyOptions,
    meta: {
      public: isPublic,
    },
  })
    .use(Tus, {
      endpoint: config.tusUrl,
      removeFingerprintOnSuccess: true,
      headers: {
        authorization: `Bearer ${token}`,
      },
    })
    .on('file-editor:complete', (data) => {
      console.info('File editor complete:', data);
      opts.statusEventHandler?.onFileEditorComplete?.(data);
    })
    .on('upload', (data) => {
      console.info('Upload started:', data);
      opts.statusEventHandler?.onUploadStart?.(data);
    })
    .on('error', (error) => {
      console.error('Upload error:', error);
      opts.statusEventHandler?.onError?.(error);
    })
    .on('complete', (result: UploadResult<UppyMeta, UppyBody>) => {
      console.info('Upload complete:', result);
      if (!useImadoAPI) console.warn('Imado API is disabled, files will not be uploaded to Imado.');

      let mappedResult: { file: UppyFile<UppyMeta, UppyBody>; url: string }[] = [];

      if (result.successful && useImadoAPI) {
        mappedResult = result.successful.map((file) => {
          const uploadKey = file.uploadURL?.split('/').pop();
          const url = new URL(`${rootUrl}/${sub}/${uploadKey}`);
          return { file, url: url.toString() };
        });
      }

      opts.statusEventHandler?.onComplete?.(mappedResult, result);
    });

  return imadoUppy;
}
