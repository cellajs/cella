import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FetchLike } from '../../lib/utils/fetch-like';
import { hydrateRuntimeSecrets } from './runtime-secrets';

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

function fetchSecret(values: Record<string, string | null>): FetchLike {
  return async (url) => {
    const id = url.split('/secrets/')[1]!.split('/')[0]!;
    const value = values[id];
    if (value === null || value === undefined) return { ok: false, status: 404, text: async () => '' };
    return { ok: true, status: 200, text: async () => JSON.stringify({ data: Buffer.from(value).toString('base64') }) };
  };
}

describe('hydrateRuntimeSecrets', () => {
  it("reads each copy with the key of the service it belongs to, so a host's services never read each other's folders", async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'infra-boot-'));
    const tokens: Record<string, string> = {};
    const fetchImpl: FetchLike = async (url, init) => {
      const id = url.split('/secrets/')[1]!.split('/')[0]!;
      tokens[id] = (init?.headers as Record<string, string> | undefined)?.['X-Auth-Token'] ?? '';
      return { ok: true, status: 200, text: async () => JSON.stringify({ data: Buffer.from(`v-${id}`).toString('base64') }) };
    };
    await hydrateRuntimeSecrets({
      manifest: [
        { envVar: 'COOKIE_SECRET', secretId: 'copy-backend', required: true, service: 'backend' },
        { envVar: 'CDC_SECRET', secretId: 'copy-cdc', required: true, service: 'cdc' },
      ],
      secretKey: 'backend-key',
      secretKeys: { backend: 'backend-key', cdc: 'cdc-key' },
      region: 'nl-ams',
      outputPath: join(tempDir, '.env.runtime'),
      fetchImpl,
    });
    expect(tokens).toEqual({ 'copy-backend': 'backend-key', 'copy-cdc': 'cdc-key' });
  });

  it("must not read a copy with another service's key when its own is missing", async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'infra-boot-'));
    await expect(
      hydrateRuntimeSecrets({
        manifest: [{ envVar: 'CDC_SECRET', secretId: 'copy-cdc', required: true, service: 'cdc' }],
        secretKey: 'backend-key',
        secretKeys: { backend: 'backend-key' },
        region: 'nl-ams',
        outputPath: join(tempDir, '.env.runtime'),
        fetchImpl: fetchSecret({ 'copy-cdc': 'x' }),
      }),
    ).rejects.toThrow(/no key for service 'cdc'/);
  });

  it('writes deliverable secrets mode 0600', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'infra-boot-'));
    const outputPath = join(tempDir, '.env.runtime');
    const delivered = await hydrateRuntimeSecrets({
      manifest: [{ envVar: 'COOKIE_SECRET', secretId: 'secret-1', required: true }],
      secretKey: 'secret',
      region: 'nl-ams',
      outputPath,
      fetchImpl: fetchSecret({ 'secret-1': 'abc' }),
    });
    expect(await readFile(outputPath, 'utf-8')).toBe('COOKIE_SECRET=abc\n');
    // Boot redacts by these values, so every delivered secret is returned.
    expect(delivered).toEqual(['abc']);
    expect((await stat(outputPath)).mode & 0o777).toBe(0o600);
  });

  it('skips missing optional secrets and fails missing required secrets', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'infra-boot-'));
    await expect(
      hydrateRuntimeSecrets({
        manifest: [{ envVar: 'OPTIONAL', secretId: 'missing', required: false }],
        secretKey: 'secret',
        region: 'nl-ams',
        outputPath: join(tempDir, '.env.runtime'),
        fetchImpl: fetchSecret({ missing: null }),
      }),
    ).resolves.toEqual([]);
    await expect(
      hydrateRuntimeSecrets({
        manifest: [{ envVar: 'REQUIRED', secretId: 'missing', required: true }],
        secretKey: 'secret',
        region: 'nl-ams',
        outputPath: join(tempDir, '.env.runtime'),
        fetchImpl: fetchSecret({ missing: null }),
      }),
    ).rejects.toThrow(/REQUIRED: missing/);
  });

  it('rejects empty and multiline values', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'infra-boot-'));
    await expect(
      hydrateRuntimeSecrets({
        manifest: [
          { envVar: 'EMPTY', secretId: 'empty', required: true },
          { envVar: 'PEM', secretId: 'pem', required: true },
        ],
        secretKey: 'secret',
        region: 'nl-ams',
        outputPath: join(tempDir, '.env.runtime'),
        fetchImpl: fetchSecret({ empty: '', pem: 'a\nb' }),
      }),
    ).rejects.toThrow(/EMPTY: empty.*PEM: multiline/);
  });
});
