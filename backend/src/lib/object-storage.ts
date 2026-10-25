import { DeleteObjectsCommand, HeadObjectCommand, ListObjectsV2Command, NotFound, S3Client } from '@aws-sdk/client-s3';
import { appConfig } from 'shared';
import { AppError } from '#/core/error';
import { env } from '#/env';

let s3Client: S3Client | undefined;

/** Whether the backend holds S3 keys: without them it can neither sign, check nor delete stored objects. */
export const objectStorageConfigured = (): boolean => !!env.S3_ACCESS_KEY_ID && !!env.S3_ACCESS_KEY_SECRET;

/**
 * The backend's client for Scaleway Object Storage.
 * @throws AppError 503 when S3 keys are not configured, so a deployment without them is diagnosable.
 */
export function getS3Client(): S3Client {
  if (s3Client) return s3Client;

  // Blank keys reach the signer as invalid credentials and return an opaque 500.
  if (!objectStorageConfigured()) {
    throw new AppError(503, 'server_error', 'error', {
      name: 'S3NotConfigured',
      message: 'S3 credentials are not configured, cannot reach stored objects',
    });
  }

  s3Client = new S3Client({
    region: appConfig.s3.region,
    endpoint: `https://${appConfig.s3.host}`,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_ACCESS_KEY_SECRET },
  });

  return s3Client;
}

/** Size in bytes of the object stored under `key`, or null when the bucket holds none. */
export async function storedObjectSize(bucketName: string, key: string): Promise<number | null> {
  try {
    const head = await getS3Client().send(new HeadObjectCommand({ Bucket: bucketName, Key: key }));
    return head.ContentLength ?? 0;
  } catch (error) {
    if (error instanceof NotFound) return null;
    throw error;
  }
}

/** DeleteObjects takes at most this many keys per request. */
const deleteBatchSize = 1000;

/**
 * Deletes the objects under `keys`. The upload buckets are versioned, so a delete leaves a marker and the bytes go with
 * the bucket's noncurrent-version expiry. A key the bucket does not hold counts as deleted.
 * @throws When the request fails or the bucket refuses any key.
 */
export async function deleteStoredObjects(bucketName: string, keys: string[]): Promise<void> {
  for (let start = 0; start < keys.length; start += deleteBatchSize) {
    const batch = keys.slice(start, start + deleteBatchSize);
    const result = await getS3Client().send(
      new DeleteObjectsCommand({ Bucket: bucketName, Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true } }),
    );
    const failed = result.Errors ?? [];
    if (failed.length > 0) {
      throw new Error(`Object storage refused ${failed.length} of ${batch.length} deletes in ${bucketName}: ${failed[0].Code} ${failed[0].Key}`);
    }
  }
}

/**
 * Deletes every object whose key starts with `prefix`, a page of listed keys at a time.
 * @returns The number of objects deleted; 0 when nothing is stored under the prefix.
 */
export async function deleteStoredPrefix(bucketName: string, prefix: string): Promise<number> {
  let deleted = 0;
  let ContinuationToken: string | undefined;
  do {
    const page = await getS3Client().send(new ListObjectsV2Command({ Bucket: bucketName, Prefix: prefix, ContinuationToken }));
    const keys = (page.Contents ?? []).flatMap(({ Key }) => (Key ? [Key] : []));
    await deleteStoredObjects(bucketName, keys);
    deleted += keys.length;
    ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return deleted;
}
