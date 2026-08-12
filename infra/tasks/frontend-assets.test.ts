import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isHashedPath, uploadFrontendAssets } from './frontend-assets';

/** HEAD responses per key: an object (optionally with ETag) means the key exists, absence means 404. */
let headResponses: Record<string, { ETag?: string }>;
/** PutObject inputs captured per key. */
let puts: Record<string, { CacheControl?: string; ContentType?: string }>;

vi.mock('@aws-sdk/client-s3', () => {
  class HeadObjectCommand {
    constructor(public input: { Key: string }) {}
  }
  class PutObjectCommand {
    constructor(public input: { Key: string; CacheControl?: string; ContentType?: string }) {}
  }
  class S3Client {
    async send(cmd: HeadObjectCommand | PutObjectCommand) {
      if (cmd instanceof HeadObjectCommand) {
        const response = headResponses[cmd.input.Key];
        if (!response) throw Object.assign(new Error('NotFound'), { name: 'NotFound' });
        return response;
      }
      puts[cmd.input.Key] = { CacheControl: cmd.input.CacheControl, ContentType: cmd.input.ContentType };
      return {};
    }
  }
  return { S3Client, HeadObjectCommand, PutObjectCommand };
});

const md5 = (content: string) => createHash('md5').update(Buffer.from(content)).digest('hex');

describe('isHashedPath', () => {
  it('treats only /assets/ as content-hashed', () => {
    expect(isHashedPath('assets/app-abc123.js')).toBe(true);
    // static/ keys keep stable names with changing content (docs.gen, openapi.json, flags)
    expect(isHashedPath('static/docs.gen/operations.gen.json')).toBe(false);
    expect(isHashedPath('static/openapi.json')).toBe(false);
    expect(isHashedPath('favicon.ico')).toBe(false);
  });
});

describe('uploadFrontendAssets', () => {
  let distDir: string;

  const files: Record<string, string> = {
    'assets/app-abc123.js': 'hashed existing',
    'assets/app-def456.js': 'hashed new',
    'static/docs.gen/operations.gen.json': '[{"id":"getMe"}]',
    'static/openapi.json': '{"info":{"version":"v2"}}',
    'favicon.ico': 'icon',
    'index.html': '<html>entry, must not upload</html>',
    'sw.js': '// entry, must not upload',
  };

  beforeEach(() => {
    distDir = mkdtempSync(join(tmpdir(), 'frontend-assets-'));
    for (const [key, content] of Object.entries(files)) {
      mkdirSync(dirname(join(distDir, key)), { recursive: true });
      writeFileSync(join(distDir, key), content);
    }
    puts = {};
    headResponses = {
      'assets/app-abc123.js': {},
      // Same key, same content on the remote: ETag matches the local MD5
      'static/docs.gen/operations.gen.json': { ETag: `"${md5('[{"id":"getMe"}]')}"` },
      // Same key, but the remote holds a previous release's content
      'static/openapi.json': { ETag: `"${md5('{"info":{"version":"v1"}}')}"` },
    };
  });

  afterEach(() => rmSync(distDir, { recursive: true, force: true }));

  it('skips existing hashed keys, skips unchanged stable keys, re-uploads changed ones', async () => {
    const result = await uploadFrontendAssets({ distDir, bucket: 'b', region: 'r', log: () => {} });

    expect(result).toEqual({ uploaded: 3, skipped: 2 });
    expect(Object.keys(puts).sort()).toEqual(['assets/app-def456.js', 'favicon.ico', 'static/openapi.json']);
    expect(puts['assets/app-def456.js']?.CacheControl).toBe('public, max-age=31536000, immutable');
    expect(puts['static/openapi.json']?.CacheControl).toBe('public, max-age=3600');
    expect(puts['favicon.ico']?.CacheControl).toBe('public, max-age=3600');
  });
});
