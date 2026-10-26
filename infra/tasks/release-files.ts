import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type FetchLike, resolveFetch } from '../lib/utils/fetch-like';
import { runIfMain } from '../lib/utils/is-main';
import { getFlag } from './args';
import { contentTypeFor, ENTRY_FILE_NAMES, isEntryFile, isHashedPath, listDistKeys } from './frontend-assets';

/** Where a release's entry files wait until the deploy publishes them: nothing serves this prefix. */
export function releaseEntryPrefix(sha: string): string {
  return `releases/${sha}/`;
}

/** One file the builder uploads: its path on the builder, its key in the frontend bucket, and the headers it is stored with. */
export interface ReleaseFile {
  path: string;
  key: string;
  contentType: string;
  cacheControl: string;
}

const HASHED_CACHE = 'public, max-age=31536000, immutable';
const STABLE_CACHE = 'public, max-age=3600';
const ENTRY_CACHE = 'no-cache, no-store, must-revalidate';

/**
 * What the builder uploads of a release's frontend. A hashed file goes up when the bucket lacks it; a stable-named one (static/, favicon) when
 * the bucket's copy differs; the release's entry files always, under `releases/<sha>/`. It reads the bucket over its public endpoint, so it runs
 * where no key is: in the container that also runs the app's build.
 */
export async function releaseFiles(opts: { distDir: string; sha: string; publicBase: string; fetchImpl?: FetchLike }): Promise<ReleaseFile[]> {
  const fetchImpl = resolveFetch(opts.fetchImpl);
  const keys = listDistKeys(opts.distDir);
  const files: ReleaseFile[] = [];
  const queue = keys.filter((key) => !isEntryFile(key));
  const workers = Array.from({ length: 32 }, async () => {
    for (let key = queue.shift(); key !== undefined; key = queue.shift()) {
      const path = join(opts.distDir, key);
      const head = await fetchImpl(`${opts.publicBase}/${key}`, { method: 'HEAD' });
      if (isHashedPath(key)) {
        if (head.ok) continue;
        files.push({ path, key, contentType: contentTypeFor(key), cacheControl: HASHED_CACHE });
        continue;
      }
      const remote = head.ok ? (head.headers?.get('etag') ?? '').replaceAll('"', '') : '';
      if (remote === createHash('md5').update(readFileSync(path)).digest('hex')) continue;
      files.push({ path, key, contentType: contentTypeFor(key), cacheControl: STABLE_CACHE });
    }
  });
  await Promise.all(workers);
  files.sort((a, b) => a.key.localeCompare(b.key));
  for (const name of ENTRY_FILE_NAMES) {
    if (!keys.includes(name)) continue;
    files.push({
      path: join(opts.distDir, name),
      key: `${releaseEntryPrefix(opts.sha)}${name}`,
      contentType: contentTypeFor(name),
      cacheControl: ENTRY_CACHE,
    });
  }
  return files;
}

/** The builder's step: one tab-separated line per file, which its script uploads with the builder key. */
export async function main(argv = process.argv.slice(2)): Promise<void> {
  const distDir = getFlag(argv, '--dist');
  const sha = getFlag(argv, '--sha');
  const publicBase = getFlag(argv, '--bucket-url');
  if (!distDir || !sha || !publicBase) throw new Error('Usage: release-files.ts --dist <dir> --sha <git-sha> --bucket-url <public bucket URL>');
  for (const file of await releaseFiles({ distDir, sha, publicBase })) {
    process.stdout.write(`${file.path}\t${file.key}\t${file.contentType}\t${file.cacheControl}\n`);
  }
}

runIfMain(import.meta.url, main);
