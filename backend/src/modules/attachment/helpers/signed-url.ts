import { appConfig } from 'shared';
import { AppError } from '#/core/error';
import { env } from '#/env';
import { presignGetObject } from '#/modules/attachment/helpers/presign-get-object';

interface GetUrlOptions {
  publicBucket: boolean;
  bucketName: string;
  expiresIn?: number;
}

/**
 * Resolves an object URL in Scaleway Object Storage: a public one as a permanent URL, a private one
 * presigned for `expiresIn` seconds (default 24h). A `blob:` key names no stored object, only a
 * browser's local file: it throws, and is never signed or turned into a bucket URL.
 */
export async function getSignedUrlFromKey(Key: string, { publicBucket, bucketName, expiresIn = 86400 }: GetUrlOptions): Promise<string> {
  if (Key.startsWith('blob:')) {
    throw new AppError(500, 'server_error', 'error', { message: 'A blob: key names no stored object to sign' });
  }

  if (publicBucket) return `https://${bucketName}.${appConfig.s3.host}/${Key}`;

  const accessKeyId = env.S3_ACCESS_KEY_ID;
  const secretAccessKey = env.S3_ACCESS_KEY_SECRET;

  // Blank keys would sign a URL the bucket rejects. Fail with a typed 503 so a deployment without S3 configured is
  // diagnosable.
  if (!accessKeyId || !secretAccessKey) {
    throw new AppError(503, 'server_error', 'error', {
      name: 'S3NotConfigured',
      message: 'S3 credentials are not configured, cannot sign object URLs',
    });
  }

  return presignGetObject({
    host: appConfig.s3.host,
    region: appConfig.s3.region,
    bucket: bucketName,
    key: Key,
    accessKeyId,
    secretAccessKey,
    expiresIn,
  });
}
