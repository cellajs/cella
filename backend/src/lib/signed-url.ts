import { env } from '#/env';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl as s3SignedUrl } from '@aws-sdk/s3-request-presigner';
import { appConfig } from 'config';

const s3Client = new S3Client({
  region: appConfig.s3Region,
  endpoint: `https://${appConfig.s3Host}`,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_ACCESS_KEY_SECRET,
  },
});

interface GetUrlOptions {
  isPublic?: boolean;
  expiresIn?: number;
}

/**
 * Generate a presigned URL for a private object in Scaleway Object Storage.
 * - Blob → return as-is
 * - Public → returns permanent public URL (no signing)
 * - Private → returns presigned URL with optional `expiresIn` (default 24h)
 *
 * @param Key - The object key or blob URL.
 * @param options - Optional settings:
 *   - isPublic: boolean flag (default: false)
 *   - expiresIn: seconds until the presigned URL expires (only used if private, default: 86400)
 * @returns A promise resolving to the URL string.
 */
export async function getSignedUrlFromKey(Key: string, { isPublic = false, expiresIn = 86400 }: GetUrlOptions = {}): Promise<string> {
  // Already a local blob URL (e.g. from File API)
  if (Key.startsWith('blob:http')) return Key;

  // Public,  constract URL
  if (isPublic) return `${appConfig.publicCDNUrl}/${Key}`;

  // Private, sign URL
  return s3SignedUrl(s3Client, new GetObjectCommand({ Bucket: appConfig.s3PrivateBucket, Key }), { expiresIn });
}
