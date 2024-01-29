import { UploadResult, Uppy, UppyOptions } from '@uppy/core';

import Tus from '@uppy/tus';
import { config } from 'config';
import { getUploadToken } from '../api/api';
import { UploadParams, UploadType } from '../types';

import '@uppy/core/dist/style.min.css';

const readJwt = (token: string) => JSON.parse(atob(token.split('.')[1]));

interface ImadoUploadParams extends UploadParams {
  organisationId?: string;
  completionHandler: (urls: URL[], result?: UploadResult) => void;
}

export async function ImadoUppy(
  type: UploadType,
  uppyOptions: UppyOptions,
  opts: ImadoUploadParams = { public: false, completionHandler: () => {} },
  organizationId?: string,
): Promise<Uppy> {
  // Get upload token and check if public or private files
  const token = await getUploadToken(type, { public: opts.public }, organizationId);

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
      console.log('Upload started:', data);
    })
    .on('error', (error) => {
      console.error('Upload error:', error);
    })
    .on('complete', (result: UploadResult) => {
      if (!useImadoAPI)
        console.warn(
          'Imado API is disabled, files will not be uploaded to Imado and you need to handle the completion yourself (move `./files/` to CDN) to serve files.',
        );

      if (result.successful && useImadoAPI) {
        const urls = result.successful.map((file) => {
          const uploadKey = file.uploadURL.split('/').pop();
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
