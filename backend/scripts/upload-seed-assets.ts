import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { appConfig } from 'shared';
import { env } from '#/env';
import { checkMark, crossMark, startSpinner, succeedSpinner, warnSpinner } from '#/utils/console';
import { type SeedAsset, seedAssetsPrefix } from './seeds/seed-assets';

/**
 * Publishes the seed asset set to the public bucket and writes `seeds/seed-assets.json`, the
 * manifest `pnpm seed` reads. Source layout: `seeds/assets/<basename>/<variant>.<ext>` with
 * `original` required and `thumbnail`, `preview`, `converted` optional. Objects under the
 * published prefix are immutable: an existing key with another size is reported, never replaced.
 *
 * `--check` needs no credentials: it HEADs every key anonymously over HTTPS and compares sizes,
 * so any checkout, apps included, can confirm the set its manifest points at is reachable.
 */
const assetsDir = join(import.meta.dirname, 'seeds', 'assets');
const manifestPath = join(import.meta.dirname, 'seeds', 'seed-assets.json');
const checkOnly = process.argv.includes('--check');

const contentTypes: Record<string, string> = {
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
};

const variants = ['original', 'thumbnail', 'preview', 'converted'] as const;
type Variant = (typeof variants)[number];

interface LocalFile {
  key: string;
  path: string;
  contentType: string;
  size: number;
}

/** Reads the asset folders into manifest entries plus the files behind them, sorted by folder name. */
function readLocalAssets(): { assets: SeedAsset[]; files: LocalFile[] } {
  const assets: SeedAsset[] = [];
  const files: LocalFile[] = [];

  for (const basename of readdirSync(assetsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
    const dir = join(assetsDir, basename);
    const byVariant = new Map<Variant, LocalFile>();

    for (const name of readdirSync(dir).sort()) {
      const ext = extname(name);
      const variant = name.slice(0, -ext.length) as Variant;
      if (!variants.includes(variant)) throw new Error(`${basename}/${name}: file name must be one of ${variants.join(', ')}`);
      const contentType = contentTypes[ext];
      if (!contentType) throw new Error(`${basename}/${name}: no content type for ${ext}`);
      const path = join(dir, name);
      byVariant.set(variant, { key: `${seedAssetsPrefix}/${basename}/${name}`, path, contentType, size: readFileSync(path).byteLength });
    }

    const original = byVariant.get('original');
    if (!original) throw new Error(`${basename}: missing original.<ext>`);

    const keys: SeedAsset['keys'] = { original: original.key };
    for (const variant of variants) {
      const file = byVariant.get(variant);
      if (file && variant !== 'original') keys[variant] = file.key;
    }

    assets.push({
      filename: `${basename}${extname(original.path)}`,
      contentType: original.contentType,
      convertedContentType: byVariant.get('converted')?.contentType ?? null,
      size: String(original.size),
      keys,
    });
    files.push(...byVariant.values());
  }

  return { assets, files };
}

/** Anonymous HEAD per key; returns the keys that are missing or differ in size. */
async function verifyPublished(files: LocalFile[]): Promise<string[]> {
  const problems: string[] = [];
  for (const file of files) {
    const url = `${appConfig.s3.publicCDNUrl}/${file.key}`;
    try {
      const res = await fetch(url, { method: 'HEAD' });
      const length = Number(res.headers.get('content-length'));
      if (!res.ok) problems.push(`${file.key}: HTTP ${res.status}`);
      else if (length !== file.size) problems.push(`${file.key}: bucket has ${length} bytes, local ${file.size}`);
    } catch (err) {
      problems.push(`${file.key}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return problems;
}

async function upload(files: LocalFile[]): Promise<void> {
  if (!env.S3_ACCESS_KEY_ID || !env.S3_ACCESS_KEY_SECRET) {
    console.error(`${crossMark} S3_ACCESS_KEY_ID / S3_ACCESS_KEY_SECRET are not set in backend/.env`);
    process.exit(1);
  }

  const bucket = appConfig.s3.publicBucket;
  const s3Client = new S3Client({
    region: appConfig.s3.region,
    endpoint: `https://${appConfig.s3.host}`,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_ACCESS_KEY_SECRET },
  });

  let uploaded = 0;
  let conflicts = 0;

  for (const file of files) {
    startSpinner(`${file.key}`);
    try {
      const head = await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: file.key }));
      if (head.ContentLength === file.size) {
        succeedSpinner(`${file.key} already published`);
        continue;
      }
      conflicts++;
      warnSpinner(`${crossMark} ${file.key} exists with ${head.ContentLength} bytes (local ${file.size}); bump the version prefix`);
      continue;
    } catch (err) {
      if (!(err instanceof Error) || err.name !== 'NotFound') throw err;
    }

    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: file.key,
        Body: readFileSync(file.path),
        ContentType: file.contentType,
        ACL: 'public-read',
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    uploaded++;
    succeedSpinner(`${file.key} uploaded (${file.size} bytes)`);
  }

  console.info(`Uploaded ${uploaded} of ${files.length} objects to ${bucket}/${seedAssetsPrefix}`);
  if (conflicts) process.exit(1);
}

async function main(): Promise<void> {
  const { assets, files } = readLocalAssets();
  const manifest = `${JSON.stringify(assets, null, 2)}\n`;

  if (checkOnly) {
    // Parsed comparison, so formatter whitespace in the committed file does not count as drift.
    const current = existsSync(manifestPath) ? JSON.stringify(JSON.parse(readFileSync(manifestPath, 'utf8'))) : '';
    const stale = current !== JSON.stringify(assets);
    if (stale) console.warn(`${crossMark} seeds/seed-assets.json is stale; run pnpm seed:assets`);
    const problems = await verifyPublished(files);
    for (const problem of problems) console.error(`${crossMark} ${problem}`);
    if (problems.length || stale) process.exit(1);
    console.info(`${checkMark} ${files.length} objects published under ${appConfig.s3.publicCDNUrl}/${seedAssetsPrefix}`);
    return;
  }

  await upload(files);
  writeFileSync(manifestPath, manifest);
  console.info(`${checkMark} wrote seeds/seed-assets.json (${assets.length} assets)`);

  const problems = await verifyPublished(files);
  for (const problem of problems) console.error(`${crossMark} ${problem}`);
  if (problems.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
