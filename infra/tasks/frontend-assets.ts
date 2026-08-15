import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// The deploy command owns asset semantics (the SST StaticSite pattern): the
// hashed bundle uploads before the rollout, entry files publish only after
// version verification (deploy-run.publishEntryFiles).

/** Entry files that must NOT upload with the bundle: they go live last. */
export const ENTRY_FILE_NAMES = ['index.html', 'sw.js', 'sw.js.map', 'manifest.webmanifest'] as const;

const contentTypes: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
};

export function contentTypeFor(key: string): string {
  const dot = key.lastIndexOf('.');
  return (dot >= 0 ? contentTypes[key.slice(dot)] : undefined) ?? 'application/octet-stream';
}

/**
 * Content-hashed, immutable paths: existence of the key proves the content
 * matches. Only /assets/ qualifies; /static/ keys keep stable names with
 * changing content (docs.gen JSON, openapi.json, flags), so existence proves
 * nothing there.
 */
export function isHashedPath(key: string): boolean {
  return key.startsWith('assets/');
}

export function isEntryFile(key: string): boolean {
  return (ENTRY_FILE_NAMES as readonly string[]).includes(key);
}

/** Recursively list dist files as bucket keys (posix separators). */
export function listDistKeys(distDir: string): string[] {
  const keys: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else keys.push(relative(distDir, path).split('\\').join('/'));
    }
  };
  walk(distDir);
  return keys;
}

export interface UploadAssetsOptions {
  distDir: string;
  bucket: string;
  region: string;
  log?: (message: string) => void;
}

/**
 * Upload the built frontend bundle (everything except entry files). Hashed
 * paths get a 1-year immutable cache and skip upload when the key already
 * exists (content-addressed names make that check exact). Stable-named keys
 * (static/, favicon, robots.txt) change content under the same name, so they
 * get a short cache and skip only when the remote ETag matches the local MD5;
 * unchanged deploys stay nearly free either way.
 */
export async function uploadFrontendAssets(opts: UploadAssetsOptions): Promise<{ uploaded: number; skipped: number }> {
  const log = opts.log ?? ((message: string) => console.info(message));
  const { S3Client, ListObjectsV2Command, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const s3 = new S3Client({
    region: opts.region,
    endpoint: `https://s3.${opts.region}.scw.cloud`,
    credentials: {
      accessKeyId: process.env.SCW_ACCESS_KEY ?? process.env.AWS_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.SCW_SECRET_KEY ?? process.env.AWS_SECRET_ACCESS_KEY ?? '',
    },
    forcePathStyle: false,
  });

  // One paginated listing replaces a HeadObject round trip per key: existence
  // answers the hashed paths, the listed ETag answers the stable-named ones
  // (ETag is the content MD5 for single-part uploads, which is all this
  // uploader ever performs).
  const remoteEtags = new Map<string, string>();
  let continuationToken: string | undefined;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: opts.bucket, ContinuationToken: continuationToken }));
    for (const object of page.Contents ?? []) {
      if (object.Key) remoteEtags.set(object.Key, object.ETag?.replaceAll('"', '') ?? '');
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);

  const keys = listDistKeys(opts.distDir).filter((key) => !isEntryFile(key));
  let uploaded = 0;
  let skipped = 0;
  const queue = [...keys];
  // Uploads are the only per-key round trip; wide parallelism over these
  // small objects keeps the transfer S3-bound.
  const workers = Array.from({ length: 32 }, async () => {
    for (let key = queue.shift(); key !== undefined; key = queue.shift()) {
      if (isHashedPath(key)) {
        if (remoteEtags.has(key)) {
          skipped++;
          continue;
        }
        const body = readFileSync(join(opts.distDir, key));
        await s3.send(
          new PutObjectCommand({
            Bucket: opts.bucket,
            Key: key,
            Body: body,
            ContentType: contentTypeFor(key),
            CacheControl: 'public, max-age=31536000, immutable',
          }),
        );
        uploaded++;
        continue;
      }
      // Stable-named key: an ETag match means the object is already current.
      const body = readFileSync(join(opts.distDir, key));
      const md5 = createHash('md5').update(body).digest('hex');
      if (remoteEtags.get(key) === md5) {
        skipped++;
        continue;
      }
      await s3.send(
        new PutObjectCommand({
          Bucket: opts.bucket,
          Key: key,
          Body: body,
          ContentType: contentTypeFor(key),
          CacheControl: 'public, max-age=3600',
        }),
      );
      uploaded++;
    }
  });
  await Promise.all(workers);
  log(`[deploy] frontend assets: ${uploaded} uploaded, ${skipped} unchanged (skipped)`);
  return { uploaded, skipped };
}
