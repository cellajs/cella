import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The loader reads its paths from env at import time, so they are pinned to a temp dir before the dynamic import.
const dir = mkdtempSync(join(tmpdir(), 'geoip-'));
process.env.GEOIP_COUNTRY_DB_PATH = join(dir, 'country.mmdb');
process.env.GEOIP_ASN_DB_PATH = join(dir, 'asn.mmdb');
process.env.GEOIP_SOURCE_URL = 'https://geoip.test/geoip';

const { openMock } = vi.hoisted(() => ({
  openMock: vi.fn(async (path: string) => ({
    get: (ip: string) => {
      if (ip !== '203.0.113.7') return null;
      return path.includes('country') ? { country: { iso_code: 'NL' } } : { autonomous_system_number: 1136 };
    },
  })),
}));
vi.mock('maxmind', () => ({ open: openMock }));

const { lookupIp, lookupTargetIp, refreshGeoipDatabases } = await import('#/lib/geoip');

/** A gzipped stand-in for the MMDB archive: the reader is mocked, only the file plumbing is real. */
const archive = (content: string) => gzipSync(Buffer.from(content));

const respond = (status: number, body?: Buffer, etag?: string) =>
  new Response(status === 200 && body ? new Uint8Array(body) : null, { status, headers: etag ? { etag } : {} });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('lookupIp', () => {
  it('returns nulls without a database file and never touches the network', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(await lookupIp('203.0.113.7')).toEqual({ country: null, asn: null });
    expect(await lookupIp(null)).toEqual({ country: null, asn: null });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(openMock).not.toHaveBeenCalled();
  });
});

describe('refreshGeoipDatabases', () => {
  it('downloads both databases from the source, remembers their etags and serves the new data', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      respond(
        200,
        archive(url.includes('country') ? 'country-v1' : 'asn-v1'),
        `"v1-${url.includes('country') ? 'c' : 'a'}"`,
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    expect(await refreshGeoipDatabases()).toEqual({ country: 'updated', asn: 'updated' });

    // The two refreshes run in parallel, so the requests may leave in either order.
    expect(fetchMock.mock.calls.map(([url]) => url).sort()).toEqual([
      'https://geoip.test/geoip/dbip-asn-lite.mmdb.gz',
      'https://geoip.test/geoip/dbip-country-lite.mmdb.gz',
    ]);
    expect(readFileSync(join(dir, 'country.mmdb'), 'utf8')).toBe('country-v1');
    expect(readFileSync(join(dir, 'country.mmdb.etag'), 'utf8')).toBe('"v1-c"');
    expect(existsSync(join(dir, 'country.mmdb.tmp'))).toBe(false);

    expect(await lookupIp('203.0.113.7')).toEqual({ country: 'NL', asn: 1136 });
    expect(await lookupIp('203.0.113.8')).toEqual({ country: null, asn: null });
    expect(openMock).toHaveBeenCalledTimes(2);
  });

  it('asks conditionally and leaves the files and readers alone on 304', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => respond(304));
    vi.stubGlobal('fetch', fetchMock);

    expect(await refreshGeoipDatabases()).toEqual({ country: 'unchanged', asn: 'unchanged' });

    // Each refresh reads its etag file before it fetches, so the requests leave in either order.
    const headersFor = (object: string) => fetchMock.mock.calls.find(([url]) => url.endsWith(object))?.[1]?.headers;
    expect(headersFor('dbip-country-lite.mmdb.gz')).toEqual({ 'if-none-match': '"v1-c"' });
    expect(headersFor('dbip-asn-lite.mmdb.gz')).toEqual({ 'if-none-match': '"v1-a"' });
    expect(readFileSync(join(dir, 'country.mmdb'), 'utf8')).toBe('country-v1');
    expect(await lookupIp('203.0.113.7')).toEqual({ country: 'NL', asn: 1136 });
    // Mocks are cleared between tests: no reopen at all is the assertion.
    expect(openMock).not.toHaveBeenCalled();
  });

  it('keeps the previous data when the source fails or is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('country')) return respond(503);
        throw new Error('ECONNRESET');
      }),
    );

    expect(await refreshGeoipDatabases()).toEqual({ country: 'failed', asn: 'failed' });
    expect(readFileSync(join(dir, 'country.mmdb'), 'utf8')).toBe('country-v1');
    expect(await lookupIp('203.0.113.7')).toEqual({ country: 'NL', asn: 1136 });
  });

  it('replaces a database when its etag moved and reopens only that reader', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('country') ? respond(200, archive('country-v2'), '"v2-c"') : respond(304),
      ),
    );

    expect(await refreshGeoipDatabases()).toEqual({ country: 'updated', asn: 'unchanged' });
    expect(readFileSync(join(dir, 'country.mmdb'), 'utf8')).toBe('country-v2');
    expect(await lookupIp('203.0.113.7')).toEqual({ country: 'NL', asn: 1136 });
    expect(openMock).toHaveBeenCalledTimes(1);
    expect(openMock).toHaveBeenCalledWith(join(dir, 'country.mmdb'));
  });
});

describe('lookupTargetIp', () => {
  const sample = { mode: 'development', sampleIp: '8.8.8.8' };

  it('substitutes the sample address for loopback and private ranges in development only', () => {
    expect(lookupTargetIp('127.0.0.1', sample)).toBe('8.8.8.8');
    expect(lookupTargetIp('::ffff:192.168.1.20', sample)).toBe('8.8.8.8');
    expect(lookupTargetIp('::1', sample)).toBe('8.8.8.8');
    expect(lookupTargetIp('203.0.113.7', sample)).toBe('203.0.113.7');
    expect(lookupTargetIp('127.0.0.1', { ...sample, mode: 'production' })).toBe('127.0.0.1');
    expect(lookupTargetIp('127.0.0.1', { ...sample, sampleIp: '' })).toBe('127.0.0.1');
  });

  it('passes an absent address through', () => {
    expect(lookupTargetIp(null, sample)).toBeNull();
    expect(lookupTargetIp('', sample)).toBeNull();
  });
});
