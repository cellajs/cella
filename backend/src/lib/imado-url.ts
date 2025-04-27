import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from 'config';
import { env } from '../env';

const s3Client = new S3Client({
  region: config.s3Region,
  endpoint: `https://${config.s3Host}`,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  },
});

/**
 * Generate a presigned URL for a private object in Scaleway Object Storage.
 */
export async function getImadoUrl(url: string): Promise<string> {
  const signedUrl = await getSignedUrl(
    s3Client,
    new GetObjectCommand({
      Bucket: config.s3PrivateBucket,
      Key: url,
    }),
    { expiresIn: 86400 }, // 24 hours
  );

  return signedUrl;
}
