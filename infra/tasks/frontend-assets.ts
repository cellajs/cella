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

/** Hashed, immutable paths: existence of the key proves the content matches. */
export function isHashedPath(key: string): boolean {
  return key.startsWith('assets/') || key.startsWith('static/');
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
 * Upload the built frontend bundle (everything except entry files) with a
 * 1-year immutable cache. Hashed paths skip upload when the key already exists
 * (content-addressed names make that check exact and unchanged deploys nearly
 * free); root files (favicon, robots.txt) always re-upload since their content
 * can change under a stable name.
 */
export async function uploadFrontendAssets(opts: UploadAssetsOptions): Promise<{ uploaded: number; skipped: number }> {
  const log = opts.log ?? ((message: string) => console.info(message));
  const { S3Client, HeadObjectCommand, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const s3 = new S3Client({
    region: opts.region,
    endpoint: `https://s3.${opts.region}.scw.cloud`,
    credentials: {
      accessKeyId: process.env.SCW_ACCESS_KEY ?? process.env.AWS_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.SCW_SECRET_KEY ?? process.env.AWS_SECRET_ACCESS_KEY ?? '',
    },
    forcePathStyle: false,
  });

  const keys = listDistKeys(opts.distDir).filter((key) => !isEntryFile(key));
  let uploaded = 0;
  let skipped = 0;
  // Modest parallelism: hundreds of small objects, no need for a full pool.
  const queue = [...keys];
  const workers = Array.from({ length: 8 }, async () => {
    for (let key = queue.shift(); key !== undefined; key = queue.shift()) {
      if (isHashedPath(key)) {
        const exists = await s3
          .send(new HeadObjectCommand({ Bucket: opts.bucket, Key: key }))
          .then(() => true)
          .catch(() => false);
        if (exists) {
          skipped++;
          continue;
        }
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
    }
  });
  await Promise.all(workers);
  log(`[deploy] frontend assets: ${uploaded} uploaded, ${skipped} unchanged (skipped)`);
  return { uploaded, skipped };
}
