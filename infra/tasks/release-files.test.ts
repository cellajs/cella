import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FetchLike } from '../lib/utils/fetch-like';
import { releaseFiles } from './release-files';

const SHA = 'b'.repeat(40);
const BASE = 'https://app-frontend.s3.nl-ams.scw.cloud';

function dist(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'dist-'));
  for (const [key, content] of Object.entries(files)) {
    mkdirSync(join(dir, key, '..'), { recursive: true });
    writeFileSync(join(dir, key), content);
  }
  return dir;
}

/** The bucket as its public endpoint answers a HEAD: key → ETag. */
function bucket(objects: Record<string, string>): FetchLike {
  return async (url) => {
    const etag = objects[url.slice(BASE.length + 1)];
    return {
      ok: etag !== undefined,
      status: etag === undefined ? 404 : 200,
      text: async () => '',
      headers: { get: () => (etag ? `"${etag}"` : null) },
    };
  };
}

const md5 = (content: string) => createHash('md5').update(content).digest('hex');

describe('releaseFiles', () => {
  it('uploads what the bucket lacks or holds otherwise, and the entry files under the release', async () => {
    const distDir = dist({
      'assets/kept-abc.js': 'kept',
      'assets/new-def.js': 'new',
      'assets/new-def.js.br': 'brotli',
      'static/same.json': 'same',
      'static/changed.json': 'changed',
      'index.html': '<html>',
      'sw.js': 'sw',
    });
    const files = await releaseFiles({
      distDir,
      sha: SHA,
      publicBase: BASE,
      fetchImpl: bucket({
        'assets/kept-abc.js': 'whatever',
        'static/same.json': md5('same'),
        'static/changed.json': md5('old'),
        'index.html': md5('<html>'),
      }),
    });
    expect(files.map((file) => file.key)).toEqual([
      'assets/new-def.js',
      'assets/new-def.js.br',
      'static/changed.json',
      `releases/${SHA}/index.html`,
      `releases/${SHA}/sw.js`,
    ]);
    expect(files[0]).toMatchObject({ contentType: 'text/javascript; charset=utf-8', cacheControl: 'public, max-age=31536000, immutable' });
    // A browser runs a module script only with a JavaScript type, so the brotli copy keeps its original's.
    expect(files[1]).toMatchObject({ contentType: 'text/javascript; charset=utf-8', contentEncoding: 'br' });
    // An entry file never goes to the root: the deploy publishes it after the rollout.
    expect(files.filter((file) => !file.key.startsWith('releases/') && /^(index\.html|sw\.js)$/.test(file.key))).toEqual([]);
    expect(files.at(-1)?.cacheControl).toBe('no-cache, no-store, must-revalidate');
  });
});
