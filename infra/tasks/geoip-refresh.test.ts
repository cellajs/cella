import { gzipSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import {
  type GeoipManifest,
  type GeoipRefreshPlan,
  monthOf,
  sequenceGeoipRefresh,
  verifyMmdbArchive,
} from './geoip-refresh';

const NOW = new Date('2026-09-23T10:00:00Z');
/** The smallest payload the verifier accepts: anything ending in the MMDB metadata marker. */
const MMDB = gzipSync(Buffer.concat([Buffer.from('tree-and-data'), Buffer.from('\xab\xcd\xefMaxMind.com', 'latin1')]));

const MANIFEST: GeoipManifest = {
  month: '2026-08',
  publishedAt: '2026-08-02T06:00:00Z',
  files: {
    country: { key: 'geoip/dbip-country-lite.mmdb.gz', month: '2026-08', bytes: 1, sha256: 'a' },
    asn: { key: 'geoip/dbip-asn-lite.mmdb.gz', month: '2026-08', bytes: 1, sha256: 'b' },
  },
};

/** A plan whose effects all succeed for the target month, recording call order into `calls`. */
function makePlan(overrides: Partial<GeoipRefreshPlan> = {}) {
  const calls: string[] = [];
  const plan: GeoipRefreshPlan = {
    bucket: 'cella-public',
    prefix: 'geoip',
    month: '2026-09',
    force: false,
    kinds: ['country', 'asn'],
    fetchDatabase: vi.fn(async (url: string) => {
      calls.push(`fetch ${url}`);
      return { status: 200, body: new Uint8Array(MMDB) };
    }),
    readManifest: vi.fn(async () => {
      calls.push('readManifest');
      return MANIFEST;
    }),
    putObject: vi.fn(async (key: string) => {
      calls.push(`put ${key}`);
    }),
    now: () => NOW,
    log: () => {},
    ...overrides,
  };
  return { plan, calls };
}

describe('sequenceGeoipRefresh', () => {
  it('downloads, verifies and uploads both databases before the manifest', async () => {
    const { plan, calls } = makePlan();
    const result = await sequenceGeoipRefresh(plan);

    expect(result.published).toBe(true);
    expect(calls).toEqual([
      'readManifest',
      'fetch https://download.db-ip.com/free/dbip-country-lite-2026-09.mmdb.gz',
      'fetch https://download.db-ip.com/free/dbip-asn-lite-2026-09.mmdb.gz',
      'put geoip/dbip-country-lite.mmdb.gz',
      'put geoip/dbip-asn-lite.mmdb.gz',
      'put geoip/manifest.json',
    ]);
    expect(result.manifest.month).toBe('2026-09');
    expect(result.manifest.publishedAt).toBe(NOW.toISOString());
    expect(result.manifest.files.country.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is a no-op when the manifest already carries the target month', async () => {
    const { plan, calls } = makePlan({ readManifest: async () => ({ ...MANIFEST, month: '2026-09' }) });
    const result = await sequenceGeoipRefresh(plan);

    expect(result).toMatchObject({ published: false, skipped: 'up-to-date' });
    expect(calls).toEqual([]);
    expect(plan.putObject).not.toHaveBeenCalled();
  });

  it('skips a manifest younger than maxAgeDays, the deploy pipeline gate', async () => {
    const { plan } = makePlan({
      maxAgeDays: 35,
      readManifest: async () => ({ ...MANIFEST, publishedAt: '2026-09-01T00:00:00Z' }),
    });
    const result = await sequenceGeoipRefresh(plan);

    expect(result).toMatchObject({ published: false, skipped: 'fresh' });
    expect(plan.fetchDatabase).not.toHaveBeenCalled();
  });

  it('publishes past the age gate once the manifest is old enough', async () => {
    const { plan } = makePlan({ maxAgeDays: 35 });
    expect((await sequenceGeoipRefresh(plan)).published).toBe(true);
  });

  it('force republishes an up-to-date month', async () => {
    const { plan } = makePlan({ force: true, readManifest: async () => ({ ...MANIFEST, month: '2026-09' }) });
    expect((await sequenceGeoipRefresh(plan)).published).toBe(true);
  });

  it('falls back to the previous month when DB-IP has not published the target yet', async () => {
    const { plan, calls } = makePlan({
      fetchDatabase: vi.fn(async (url: string) => {
        calls.push(`fetch ${url}`);
        return url.includes('2026-09') ? { status: 404, body: null } : { status: 200, body: new Uint8Array(MMDB) };
      }),
    });
    const result = await sequenceGeoipRefresh(plan);

    expect(result.published).toBe(true);
    expect(result.manifest.month).toBe('2026-08');
    expect(result.manifest.files.asn.month).toBe('2026-08');
    expect(calls.filter((c) => c.startsWith('fetch'))).toHaveLength(4);
  });

  it('uploads nothing when a download fails or an archive does not verify', async () => {
    const failing = makePlan({ fetchDatabase: async () => ({ status: 500, body: null }) });
    await expect(sequenceGeoipRefresh(failing.plan)).rejects.toThrow(/HTTP 500/);
    expect(failing.plan.putObject).not.toHaveBeenCalled();

    const html = makePlan({
      fetchDatabase: async (url) => ({
        status: 200,
        body: url.includes('asn') ? new Uint8Array(gzipSync('<html>rate limited</html>')) : new Uint8Array(MMDB),
      }),
    });
    await expect(sequenceGeoipRefresh(html.plan)).rejects.toThrow(/asn archive .* rejected: no MMDB metadata/);
    expect(html.plan.putObject).not.toHaveBeenCalled();
  });
});

describe('verifyMmdbArchive', () => {
  it('accepts a gzipped MMDB and refuses plain bytes', () => {
    expect(verifyMmdbArchive(new Uint8Array(MMDB))).toMatchObject({ ok: true });
    expect(verifyMmdbArchive(new Uint8Array([1, 2, 3]))).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/gzip/),
    });
  });
});

describe('monthOf', () => {
  it('formats UTC months and shifts across year boundaries', () => {
    expect(monthOf(new Date('2026-09-23T10:00:00Z'))).toBe('2026-09');
    expect(monthOf(new Date('2026-01-15T00:00:00Z'), -1)).toBe('2025-12');
  });
});
