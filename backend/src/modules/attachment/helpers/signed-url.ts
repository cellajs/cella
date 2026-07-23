import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl as s3SignedUrl } from '@aws-sdk/s3-request-presigner';
import { appConfig } from 'shared';
import { AppError } from '#/core/error';
import { env } from '#/env';

let s3Client: S3Client | undefined;

function getS3Client(): S3Client {
  if (s3Client) return s3Client;

  const accessKeyId = env.S3_ACCESS_KEY_ID;
  const secretAccessKey = env.S3_ACCESS_KEY_SECRET;

  // Blank keys reach the signer as invalid credentials and surface as an opaque 500.
  // Fail with a typed 503 so a deployment without S3 configured is diagnosable.
  if (!accessKeyId || !secretAccessKey) {
    throw new AppError(503, 'server_error', 'error', {
      name: 'S3NotConfigured',
      message: 'S3 credentials are not configured, cannot sign object URLs',
    });
  }

  s3Client = new S3Client({
    region: appConfig.s3.region,
    endpoint: `https://${appConfig.s3.host}`,
    credentials: { accessKeyId, secretAccessKey },
  });

  return s3Client;
}

interface GetUrlOptions {
  publicBucket: boolean;
  bucketName: string;
  expiresIn?: number;
}

/**
 * Resolves an object URL in Scaleway Object Storage:
 * - blob URL → returned as-is
 * - public → permanent public URL (no signing)
 * - private → presigned URL, valid for `expiresIn` seconds (default 24h)
 */
export async function getSignedUrlFromKey(
  Key: string,
  { publicBucket, bucketName, expiresIn = 86400 }: GetUrlOptions,
): Promise<string> {
  if (Key.startsWith('blob:http')) return Key;

  if (publicBucket) return `https://${bucketName}.${appConfig.s3.host}/${Key}`;

  return s3SignedUrl(getS3Client(), new GetObjectCommand({ Bucket: bucketName, Key }), { expiresIn });
}
