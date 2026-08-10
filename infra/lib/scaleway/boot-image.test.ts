import { describe, expect, it, vi } from 'vitest';
import { BOOT_IMAGE_NAME, resolveBootImage } from './boot-image';

const REGISTRY = 'rg.nl-ams.scw.cloud/cellastaging';
const SHA = '58d6ab01388f16665c8e729022912982478b8174';
const MANIFEST = JSON.stringify({ schemaVersion: 2, config: {}, layers: [] });

/**
 * Fake registry fetch. `present` lists image names that have a manifest for the
 * tag; every other name 404s. Records which repositories were queried so tests
 * can assert exactly one lookup happens.
 */
function makeFetch(present: string[]) {
  const queried: string[] = [];
  const fetchImpl = vi.fn(async (url: string) => {
    const repo = url.match(/\/v2\/(.+)\/manifests\//)?.[1] ?? '';
    queried.push(repo);
    const hit = present.some((name) => repo.endsWith(`/${name}`));
    if (hit) return { ok: true, status: 200, headers: new Map(), text: async () => MANIFEST } as never;
    return { ok: false, status: 404, headers: new Map(), text: async () => 'not found' } as never;
  });
  return { fetchImpl, queried };
}

describe('resolveBootImage', () => {
  it('resolves the current name to its manifest digest', async () => {
    const { fetchImpl, queried } = makeFetch([BOOT_IMAGE_NAME]);
    const resolved = await resolveBootImage({ registry: REGISTRY, releaseSha: SHA, secretKey: 'x', fetchImpl });
    expect(resolved.image).toBe(BOOT_IMAGE_NAME);
    expect(resolved.digest).toMatch(/^sha256:/);
    expect(queried).toHaveLength(1);
  });

  it('rethrows the lookup error (naming the image) when the manifest is absent', async () => {
    const { fetchImpl } = makeFetch([]);
    await expect(resolveBootImage({ registry: REGISTRY, releaseSha: SHA, secretKey: 'x', fetchImpl })).rejects.toThrow(
      new RegExp(`${BOOT_IMAGE_NAME}:${SHA}`),
    );
  });

  it('surfaces a non-404 failure as-is', async () => {
    const fetchImpl = vi.fn(
      async () => ({ ok: false, status: 401, headers: new Map(), text: async () => 'unauthorized' }) as never,
    );
    await expect(resolveBootImage({ registry: REGISTRY, releaseSha: SHA, secretKey: 'x', fetchImpl })).rejects.toThrow(
      /status 401/,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
