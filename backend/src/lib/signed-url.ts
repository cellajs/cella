import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl as s3SignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from 'config';
import { env } from '../env';

const s3Client = new S3Client({
  region: config.s3Region,
  endpoint: `https://${config.s3Host}`,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_ACCESS_KEY_SECRET,
  },
});

/**
 * Generate a presigned URL for a private object in Scaleway Object Storage.
 */
export async function getSignedUrl(Key: string, expiresIn = 86400): Promise<string> {
  const signedUrl = await s3SignedUrl(
    s3Client,
    new GetObjectCommand({ Bucket: config.s3PrivateBucket, Key }),
    { expiresIn }, // Default 24 hours
  );

  return signedUrl;
}
