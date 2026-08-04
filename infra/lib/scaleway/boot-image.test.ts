import { describe, expect, it, vi } from 'vitest';
import { BOOT_IMAGE_NAME, LEGACY_BOOT_IMAGE_NAMES, resolveBootImage } from './boot-image';

const REGISTRY = 'rg.nl-ams.scw.cloud/cellastaging';
const SHA = '58d6ab01388f16665c8e729022912982478b8174';
const MANIFEST = JSON.stringify({ schemaVersion: 2, config: {}, layers: [] });

/**
 * Fake registry fetch. `present` lists image names that have a manifest for the
 * tag; every other name 404s. Records which repositories were queried so tests
 * can assert the fallback order.
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
  it('resolves under the current name when present', async () => {
    const { fetchImpl, queried } = makeFetch([BOOT_IMAGE_NAME]);
    const resolved = await resolveBootImage({ registry: REGISTRY, releaseSha: SHA, secretKey: 'x', fetchImpl });
    expect(resolved.image).toBe(BOOT_IMAGE_NAME);
    expect(resolved.digest).toMatch(/^sha256:/);
    // Current name resolves first, so the legacy name is never queried.
    expect(queried).toHaveLength(1);
  });

  it('falls back to the legacy name when the current name 404s', async () => {
    const legacy = LEGACY_BOOT_IMAGE_NAMES[0];
    const { fetchImpl } = makeFetch([legacy]);
    const resolved = await resolveBootImage({ registry: REGISTRY, releaseSha: SHA, secretKey: 'x', fetchImpl });
    expect(resolved.image).toBe(legacy);
    expect(resolved.digest).toMatch(/^sha256:/);
  });

  it('rethrows the current-name error (naming the current image) when every name 404s', async () => {
    const { fetchImpl } = makeFetch([]);
    await expect(resolveBootImage({ registry: REGISTRY, releaseSha: SHA, secretKey: 'x', fetchImpl })).rejects.toThrow(
      new RegExp(`${BOOT_IMAGE_NAME}:${SHA}`),
    );
  });

  it('does not mask a non-404 failure with a legacy lookup', async () => {
    const fetchImpl = vi.fn(
      async () => ({ ok: false, status: 401, headers: new Map(), text: async () => 'unauthorized' }) as never,
    );
    await expect(resolveBootImage({ registry: REGISTRY, releaseSha: SHA, secretKey: 'x', fetchImpl })).rejects.toThrow(
      /status 401/,
    );
    // Fails fast on the current name; never tries the legacy name.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
