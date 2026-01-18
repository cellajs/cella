import { S3 } from '@aws-sdk/client-s3';
import { env } from '#/env';
import { logEvent } from '#/utils/logger';

/**
 * Scaleway S3-compatible Object Storage service.
 * Uses AWS SDK v3 with Scaleway endpoint.
 */

/**
 * Create an S3 client configured for Scaleway Object Storage
 */
export function createS3Client(): S3 {
  const region = env.SCALEWAY_REGION ?? 'fr-par';
  const endpoint = `https://s3.${region}.scw.cloud`;

  return new S3({
    region,
    endpoint,
    credentials: {
      accessKeyId: env.SCALEWAY_ACCESS_KEY ?? '',
      secretAccessKey: env.SCALEWAY_SECRET_KEY ?? '',
    },
    // Required for Scaleway S3 compatibility
    forcePathStyle: true,
  });
}

/**
 * Check if S3 credentials are configured
 */
export function isS3Configured(): boolean {
  return !!(env.SCALEWAY_ACCESS_KEY && env.SCALEWAY_SECRET_KEY);
}

/**
 * Create a new S3 bucket for a repository
 */
export async function createBucket(bucketName: string): Promise<void> {
  const s3 = createS3Client();

  try {
    await s3.createBucket({
      Bucket: bucketName,
    });

    // Enable public read access for static hosting
    await s3.putBucketPolicy({
      Bucket: bucketName,
      Policy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'PublicReadGetObject',
            Effect: 'Allow',
            Principal: '*',
            Action: 's3:GetObject',
            Resource: `arn:aws:s3:::${bucketName}/*`,
          },
        ],
      }),
    });

    // Configure for static website hosting
    await s3.putBucketWebsite({
      Bucket: bucketName,
      WebsiteConfiguration: {
        IndexDocument: { Suffix: 'index.html' },
        ErrorDocument: { Key: 'index.html' }, // SPA fallback
      },
    });

    logEvent('info', 'S3 bucket created', { bucketName });
  } catch (error) {
    logEvent('error', 'Failed to create S3 bucket', { bucketName, error });
    throw error;
  }
}

/**
 * Delete an S3 bucket and all its contents
 */
export async function deleteBucket(bucketName: string): Promise<void> {
  const s3 = createS3Client();

  try {
    // List and delete all objects first
    const listResponse = await s3.listObjectsV2({ Bucket: bucketName });
    if (listResponse.Contents && listResponse.Contents.length > 0) {
      await s3.deleteObjects({
        Bucket: bucketName,
        Delete: {
          Objects: listResponse.Contents.map((obj) => ({ Key: obj.Key! })),
        },
      });
    }

    // Delete the bucket
    await s3.deleteBucket({ Bucket: bucketName });

    logEvent('info', 'S3 bucket deleted', { bucketName });
  } catch (error) {
    logEvent('error', 'Failed to delete S3 bucket', { bucketName, error });
    throw error;
  }
}

/**
 * Upload a file or buffer to S3
 */
export async function uploadFile(
  bucketName: string,
  key: string,
  body: Buffer | string,
  contentType?: string,
): Promise<string> {
  const s3 = createS3Client();

  await s3.putObject({
    Bucket: bucketName,
    Key: key,
    Body: body,
    ContentType: contentType ?? inferContentType(key),
  });

  const region = env.SCALEWAY_REGION ?? 'fr-par';
  return `https://${bucketName}.s3.${region}.scw.cloud/${key}`;
}

/**
 * Upload extracted static site files to S3
 * Handles directory structure from zip/tar archives
 */
export async function uploadDirectory(
  bucketName: string,
  basePath: string,
  files: Array<{ path: string; content: Buffer }>,
): Promise<void> {
  const s3 = createS3Client();

  // Upload files in batches
  const batchSize = 10;
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    await Promise.all(
      batch.map((file) =>
        s3.putObject({
          Bucket: bucketName,
          Key: `${basePath}/${file.path}`,
          Body: file.content,
          ContentType: inferContentType(file.path),
        }),
      ),
    );
  }

  logEvent('info', 'Directory uploaded to S3', { bucketName, basePath, fileCount: files.length });
}

/**
 * Delete all files under a specific path prefix
 */
export async function deleteDirectory(bucketName: string, prefix: string): Promise<void> {
  const s3 = createS3Client();

  let continuationToken: string | undefined;
  do {
    const listResponse = await s3.listObjectsV2({
      Bucket: bucketName,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    });

    if (listResponse.Contents && listResponse.Contents.length > 0) {
      await s3.deleteObjects({
        Bucket: bucketName,
        Delete: {
          Objects: listResponse.Contents.map((obj) => ({ Key: obj.Key! })),
        },
      });
    }

    continuationToken = listResponse.NextContinuationToken;
  } while (continuationToken);

  logEvent('info', 'Directory deleted from S3', { bucketName, prefix });
}

/**
 * List deployment versions in a bucket
 */
export async function listDeployments(bucketName: string): Promise<string[]> {
  const s3 = createS3Client();

  const response = await s3.listObjectsV2({
    Bucket: bucketName,
    Prefix: 'deployments/',
    Delimiter: '/',
  });

  return (response.CommonPrefixes ?? []).map((p) => p.Prefix!.replace('deployments/', '').replace('/', ''));
}

/**
 * Get the size of all files under a prefix
 */
export async function getDirectorySize(bucketName: string, prefix: string): Promise<number> {
  const s3 = createS3Client();
  let totalSize = 0;
  let continuationToken: string | undefined;

  do {
    const response = await s3.listObjectsV2({
      Bucket: bucketName,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    });

    for (const obj of response.Contents ?? []) {
      totalSize += obj.Size ?? 0;
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return totalSize;
}

/**
 * Infer content type from file extension
 */
function inferContentType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();

  const contentTypes: Record<string, string> = {
    html: 'text/html; charset=utf-8',
    htm: 'text/html; charset=utf-8',
    css: 'text/css; charset=utf-8',
    js: 'application/javascript; charset=utf-8',
    mjs: 'application/javascript; charset=utf-8',
    json: 'application/json; charset=utf-8',
    xml: 'application/xml; charset=utf-8',
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    ico: 'image/x-icon',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    eot: 'application/vnd.ms-fontobject',
    otf: 'font/otf',
    pdf: 'application/pdf',
    txt: 'text/plain; charset=utf-8',
    md: 'text/markdown; charset=utf-8',
    map: 'application/json',
    wasm: 'application/wasm',
    webmanifest: 'application/manifest+json',
  };

  return contentTypes[ext ?? ''] ?? 'application/octet-stream';
}
