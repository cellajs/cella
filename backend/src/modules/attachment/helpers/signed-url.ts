import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl as s3SignedUrl } from '@aws-sdk/s3-request-presigner';
import { appConfig } from 'shared';
import { env } from '#/env';

let s3Client: S3Client | undefined;

function getS3Client(): S3Client {
  if (s3Client) return s3Client;

  s3Client = new S3Client({
    region: appConfig.s3.region,
    endpoint: `https://${appConfig.s3.host}`,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_ACCESS_KEY_SECRET,
    },
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
