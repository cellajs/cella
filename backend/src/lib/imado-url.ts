import { config } from 'config';
import { env } from '../env';

import { getSignedUrl } from '@aws-sdk/cloudfront-signer';

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

  generate(rawUrl: string, params?: ImadoUrlParams) {
    if (!rawUrl) return rawUrl;
    if (!rawUrl.startsWith(config.privateCDNUrl) && !rawUrl.startsWith(config.publicCDNUrl)) return rawUrl;

    const url = new URL(rawUrl);

    // Add requested params
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.append(key, value.toString());
      }
    }

    if (rawUrl.startsWith(config.privateCDNUrl)) {
      const signedUrl = getSignedUrl({
        url: url.toString(),
        keyPairId: this.config.cloudfrontKeyId,
        privateKey: this.config.cloudfrontPrivateKey,
        dateLessThan: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      });

      return signedUrl;
    }

    return url.toString();
  }
}

/**
 * Get a signed URL from AWS Cloudfront.
 */
export const getImadoUrl = new ImadoUrl({
  signUrl: config.privateCDNUrl,
  cloudfrontKeyId: env.AWS_CLOUDFRONT_KEY_ID,
  cloudfrontPrivateKey: env.AWS_CLOUDFRONT_PRIVATE_KEY,
});
