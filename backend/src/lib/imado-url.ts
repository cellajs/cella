import { config } from 'config';
import { env } from '../env';

import { getSignedUrl as cloudfrontGetSignedUrl } from '@aws-sdk/cloudfront-signer';

type ImadoUrlParams = {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'auto' | 'jpeg' | 'webp' | 'avif' | 'png' | 'gif' | 'pdf';
};

interface ImadoUrlConfig {
  signUrl: string;
  cloudfrontKeyId: string;
  cloudfrontPrivateKey: string;
}

class ImadoUrl {
  private config: ImadoUrlConfig;

  constructor(config: ImadoUrlConfig) {
    this.config = config;
  }

  generate(path: string | null, params?: ImadoUrlParams) {
    if (!path) return path;

    const url = new URL(path);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.append(key, value.toString());
      }
    }

    if (this.config.signUrl && path.includes(this.config.signUrl) && this.config.cloudfrontKeyId && this.config.cloudfrontPrivateKey) {
      const signed = cloudfrontGetSignedUrl({
        url: url.toString(),
        keyPairId: this.config.cloudfrontKeyId,
        privateKey: this.config.cloudfrontPrivateKey,
        dateLessThan: new Date(Date.now() + 24 * 60 * 60 * 1000).toString(),
      });

      return signed;
    }

    return url.toString();
  }
}

export const getImadoUrl = new ImadoUrl({
  signUrl: config.privateCDNUrl,
  cloudfrontKeyId: env.AWS_CLOUDFRONT_KEY_ID,
  cloudfrontPrivateKey: env.AWS_CLOUDFRONT_PRIVATE_KEY,
});
