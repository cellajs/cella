import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl as s3SignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppError } from '#/core/error';
import { getS3Client } from '#/lib/object-storage';

const urlLifetimeSeconds = 24 * 60 * 60;

/**
 * Presigns a 24-hour download URL of an object in `bucketName` of Scaleway Object Storage. A `blob:` key names no stored
 * object, only a browser's local file: it throws, and is never signed.
 */
export async function getSignedUrlFromKey(Key: string, { bucketName }: { bucketName: string }): Promise<string> {
  if (Key.startsWith('blob:')) {
    throw new AppError(500, 'server_error', 'error', { message: 'A blob: key names no stored object to sign' });
  }

  return s3SignedUrl(getS3Client(), new GetObjectCommand({ Bucket: bucketName, Key }), { expiresIn: urlLifetimeSeconds });
}
