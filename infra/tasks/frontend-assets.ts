import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { S3Client } from '@aws-sdk/client-s3';
import { deployS3Key, makeS3Client } from '../lib/scaleway/s3-client';

// The deploy command owns asset semantics (the SST StaticSite pattern): the
// hashed bundle uploads before the switches, entry files publish only after
// them (deploy-run.publishEntryFiles).

/** Entry files that must NOT upload with the bundle: they go live last. */
export const ENTRY_FILE_NAMES = ['index.html', 'sw.js', 'sw.js.map', 'manifest.webmanifest'] as const;

/** Where a release's entry files wait in the frontend bucket until the deploy publishes them: nothing serves this prefix. */
export function releaseEntryPrefix(sha: string): string {
  return `releases/${sha}/`;
}

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
  '.md': 'text/markdown; charset=utf-8',
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

/** The headers a file is stored with: the build's brotli copy of a file (`<file>.br`) keeps that file's content type. */
function contentHeaders(key: string): { ContentType: string; ContentEncoding?: 'br' } {
  return key.endsWith('.br')
    ? { ContentType: contentTypeFor(key.slice(0, -'.br'.length)), ContentEncoding: 'br' }
    : { ContentType: contentTypeFor(key) };
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
  /** The release whose entry files wait under its prefix once the bundle is up. */
  sha: string;
  log?: (message: string) => void;
}

/** The release's hashed files as a JSON array, beside its entry files: the prune keeps every file a kept release lists. */
const ASSET_LIST_NAME = 'assets.json';

/** The frontend's publishes, newest first: what the prune reads to know which releases an open tab may still run. */
const PUBLISHES_KEY = 'releases/published.json';

const frontendClient = async (region: string) => {
  const { accessKey, secretKey } = deployS3Key();
  return makeS3Client(region, accessKey, secretKey);
};

/** Every key of the bucket under `prefix` with its ETag, in one paginated listing. */
async function listKeys(s3: S3Client, bucket: string, prefix?: string): Promise<Map<string, string>> {
  const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');
  const keys = new Map<string, string>();
  let continuationToken: string | undefined;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: continuationToken }));
    for (const object of page.Contents ?? []) {
      if (object.Key) keys.set(object.Key, object.ETag?.replaceAll('"', '') ?? '');
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
  return keys;
}

/** Run `work` over every item, 32 at a time: each is one small object's round trip, so wide parallelism keeps the transfer S3-bound. */
async function eachConcurrently<T>(items: readonly T[], work: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: 32 }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) await work(item);
    }),
  );
}

/**
 * Upload a release's frontend files with the deploy key: the bundle first, then the file list and the entry files under the release's
 * prefix, which the publish copies to the root after version verification. Hashed paths get a 1-year immutable cache and skip upload when
 * the key already exists (content-addressed names make that check exact). Stable-named keys (static/, favicon, robots.txt) change content
 * under the same name: they get a short cache and skip only when the remote ETag matches the local MD5.
 */
export async function uploadFrontendAssets(opts: UploadAssetsOptions): Promise<{ uploaded: number; skipped: number }> {
  const log = opts.log ?? ((message: string) => console.info(message));
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  const s3 = await frontendClient(opts.region);

  // Existence answers the hashed paths, the listed ETag the stable-named ones: the ETag is the content MD5 of a single-part upload, the only
  // kind this uploader performs.
  const remoteEtags = await listKeys(s3, opts.bucket);

  const keys = listDistKeys(opts.distDir).filter((key) => !isEntryFile(key));
  let uploaded = 0;
  let skipped = 0;
  await eachConcurrently(keys, async (key) => {
    const hashed = isHashedPath(key);
    const body = hashed && remoteEtags.has(key) ? undefined : readFileSync(join(opts.distDir, key));
    // A hashed key's existence proves its content; a stable-named key is current when its ETag matches.
    if (!body || (!hashed && remoteEtags.get(key) === createHash('md5').update(body).digest('hex'))) {
      skipped++;
      return;
    }
    await s3.send(
      new PutObjectCommand({
        Bucket: opts.bucket,
        Key: key,
        Body: body,
        ...contentHeaders(key),
        CacheControl: hashed ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
      }),
    );
    uploaded++;
  });
  await s3.send(
    new PutObjectCommand({
      Bucket: opts.bucket,
      Key: `${releaseEntryPrefix(opts.sha)}${ASSET_LIST_NAME}`,
      Body: JSON.stringify(keys.filter(isHashedPath).sort()),
      ContentType: 'application/json',
    }),
  );
  // Last, so a release whose index.html waits under its prefix has every file it references.
  for (const name of ENTRY_FILE_NAMES) {
    if (!existsSync(join(opts.distDir, name))) continue;
    const body = readFileSync(join(opts.distDir, name));
    await s3.send(
      new PutObjectCommand({
        Bucket: opts.bucket,
        Key: `${releaseEntryPrefix(opts.sha)}${name}`,
        Body: body,
        ContentType: contentTypeFor(name),
        CacheControl: 'no-cache, no-store, must-revalidate',
      }),
    );
  }
  log(`[deploy] frontend assets: ${uploaded} uploaded, ${skipped} unchanged (skipped)`);
  return { uploaded, skipped };
}

/** One publish of a release's entry files. An empty commit stands for whatever served before the first recorded publish. */
export interface FrontendPublish {
  commit: string;
  at: string;
}

/** The publishes whose files stay: the newest, and each one replaced within the retention, as an open tab of it may still load a chunk. */
export function keptPublishes(publishes: readonly FrontendPublish[], now: Date, retentionDays: number): FrontendPublish[] {
  const cutoff = now.getTime() - retentionDays * 86_400_000;
  return publishes.filter((_, index) => index === 0 || Date.parse(publishes[index - 1]?.at ?? '') >= cutoff);
}

/**
 * Record the publish of a release, then delete every hashed file no kept publish lists. A history this call starts holds an entry for what
 * served before, whose files are unknown, and a kept release without its file list stops the prune: nothing is deleted then.
 * @returns the number of files deleted
 */
export async function pruneFrontendAssets(opts: {
  bucket: string;
  region: string;
  sha: string;
  retentionDays: number;
  now?: Date;
  log?: (message: string) => void;
}): Promise<number> {
  const log = opts.log ?? ((message: string) => console.info(message));
  const { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const s3 = await frontendClient(opts.region);
  const readJson = async (key: string): Promise<unknown> => {
    try {
      const object = await s3.send(new GetObjectCommand({ Bucket: opts.bucket, Key: key }));
      return JSON.parse((await object.Body?.transformToString()) ?? 'null');
    } catch (error) {
      if (error instanceof Error && error.name === 'NoSuchKey') return undefined;
      throw error;
    }
  };

  const now = opts.now ?? new Date();
  const recorded = await readJson(PUBLISHES_KEY);
  const history: FrontendPublish[] = Array.isArray(recorded) ? recorded : [{ commit: '', at: new Date(0).toISOString() }];
  const kept = keptPublishes([{ commit: opts.sha, at: now.toISOString() }, ...history], now, opts.retentionDays);
  await s3.send(new PutObjectCommand({ Bucket: opts.bucket, Key: PUBLISHES_KEY, Body: JSON.stringify(kept), ContentType: 'application/json' }));

  const keep = new Set<string>();
  for (const commit of new Set(kept.map((publish) => publish.commit))) {
    const listed = commit ? await readJson(`${releaseEntryPrefix(commit)}${ASSET_LIST_NAME}`) : undefined;
    if (!Array.isArray(listed)) {
      log(
        `[deploy] frontend assets: ${commit ? commit.slice(0, 10) : 'the release before the first recorded publish'} lists no files, so none is deleted`,
      );
      return 0;
    }
    for (const key of listed) keep.add(String(key));
  }
  const stale = [...(await listKeys(s3, opts.bucket, 'assets/')).keys()].filter((key) => !keep.has(key));
  await eachConcurrently(stale, async (key) => {
    await s3.send(new DeleteObjectCommand({ Bucket: opts.bucket, Key: key }));
  });
  log(`[deploy] frontend assets: ${stale.length} deleted, which no release served within ${opts.retentionDays} days lists`);
  return stale.length;
}
