import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl as s3SignedUrl } from '@aws-sdk/s3-request-presigner';
import { appConfig } from 'shared';
import { AppError } from '#/core/error';
import { getS3Client } from '#/lib/object-storage';

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

  return s3SignedUrl(getS3Client(), new GetObjectCommand({ Bucket: bucketName, Key }), { expiresIn });
}
