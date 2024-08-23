import { type UploadResult, Uppy, type UppyOptions } from '@uppy/core';

import Tus from '@uppy/tus';
import { config } from 'config';
import { getUploadToken } from '../api/general';
import type { UploadParams, UploadType } from '../types';

import '@uppy/core/dist/style.min.css';

// Your own metadata on files
export type UppyMeta = { public?: boolean };
// The response from your server
// biome-ignore lint/complexity/noBannedTypes: <explanation>
export type UppyBody = {};

const readJwt = (token: string) => JSON.parse(atob(token.split('.')[1]));

interface ImadoUploadParams extends UploadParams {
  completionHandler: (urls: URL[], result?: UploadResult<UppyMeta, UppyBody>) => void;
}
// ImadoUppy helps to create an Uppy instance that works with the Imado API
export async function ImadoUppy(
  type: UploadType,
  uppyOptions: UppyOptions<UppyMeta & UppyBody>,
  opts: ImadoUploadParams = { public: false, completionHandler: () => {}, organizationId: undefined },
): Promise<Uppy> {
  // Get upload token and check if public or private files
  const token = await getUploadToken(type, { public: opts.public, organizationId: opts.organizationId });

  if (!token) throw new Error('Failed to get upload token');

  const { public: isPublic, sub, imado: useImadoAPI } = readJwt(token);

  const rootUrl = isPublic ? config.publicCDNUrl : config.privateCDNUrl;

  // Create Uppy instance
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
    .on('upload', (data) => {
      console.info('Upload started:', data);
    })
    .on('error', (error) => {
      console.error('Upload error:', error);
    })
    .on('complete', (result: UploadResult<UppyMeta, UppyBody>) => {
      if (!useImadoAPI) console.warn('Imado API is disabled, files will not be uploaded to Imado.');

      if (result.successful && useImadoAPI) {
        const urls = result.successful.map((file) => {
          const uploadKey = file.uploadURL?.split('/').pop();
          // Sub can be user id, or user id w/ organization id
          return new URL(`${rootUrl}/${sub}/${uploadKey}`);
        });
        opts.completionHandler(urls, result);
      } else {
        opts.completionHandler([], result);
      }
    });

  return imadoUppy;
}
