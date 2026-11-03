import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFetchProbe, isHealthy, isServing, waitForPools } from './wait-for-version';

const SHA = 'abc1234';

describe('createFetchProbe', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('normalizes ws(s):// health URLs to http(s):// so fetch can probe them', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204, headers: { 'x-app-version': SHA } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await createFetchProbe(1000)('wss://www.example.dev/yjs/health');

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://www.example.dev/yjs/health');
    expect(result).toEqual({ status: 204, version: SHA });
  });

  it('leaves http(s):// URLs untouched', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204, headers: { 'x-app-version': SHA } }));
    vi.stubGlobal('fetch', fetchMock);

    await createFetchProbe(1000)('https://www.example.dev/api/health');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://www.example.dev/api/health');
  });

  it('surfaces a thrown request as status 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));

    expect(await createFetchProbe(1000)('https://www.example.dev/api/health')).toEqual({ status: 0, version: undefined });
  });
});

describe('isHealthy', () => {
  it('accepts 204 with matching version (API services)', () => {
    expect(isHealthy({ status: 204, version: SHA }, SHA)).toBe(true);
  });

  it('accepts 200 with matching version (Caddy frontend)', () => {
    expect(isHealthy({ status: 200, version: SHA }, SHA)).toBe(true);
  });

  it('rejects a matching version on an unexpected status', () => {
    expect(isHealthy({ status: 502, version: SHA }, SHA)).toBe(false);
  });

  it('rejects a healthy status serving a stale version (old container still up)', () => {
    expect(isHealthy({ status: 204, version: 'oldsha' }, SHA)).toBe(false);
  });

  it('rejects a missing version header', () => {
    expect(isHealthy({ status: 200, version: undefined }, SHA)).toBe(false);
  });

  it('rejects a failed request (status 0)', () => {
    expect(isHealthy({ status: 0, version: undefined }, SHA)).toBe(false);
  });
});

describe('the pool read', () => {
  const stat = (backend_id: string, ip: string, server_state: string) => ({ backend_id, ip, server_state, last_health_check_status: 'failed' });

  it('counts an address as serving only while its pool holds it running, whatever the last check status says (M1)', () => {
    const stats = [stat('pool', '10.0.0.3', 'running'), stat('pool', '10.0.0.4', 'stopped'), stat('other', '10.0.0.4', 'running')];
    expect(isServing(stats, 'pool', '10.0.0.3')).toBe(true);
    expect(isServing(stats, 'pool', '10.0.0.4')).toBe(false);
    expect(isServing([stat('pool', '10.0.0.3', 'starting')], 'pool', '10.0.0.3')).toBe(false);
  });

  it('waits until every pool of a role serves the address, and until none routes to it once it drains', async () => {
    const rounds = [
      [stat('api', '10.0.0.3', 'starting')],
      [stat('api', '10.0.0.3', 'running'), stat('internal', '10.0.0.3', 'stopped')],
      [stat('api', '10.0.0.3', 'running'), stat('internal', '10.0.0.3', 'running')],
    ];
    let read = 0;
    const stats = async () => rounds[Math.min(read++, rounds.length - 1)] ?? [];
    const serving = await waitForPools({
      backendIds: ['api', 'internal'],
      address: '10.0.0.3',
      want: 'serving',
      stats,
      timeoutMs: 60_000,
      sleep: async () => {},
    });
    expect([serving, read]).toEqual(['done', 3]);
    const out = await waitForPools({
      backendIds: ['api'],
      address: '10.0.0.3',
      want: 'out',
      stats: async () => [stat('api', '10.0.0.3', 'stopped')],
      timeoutMs: 1,
    });
    expect(out).toBe('done');
  });

  it('ends at once when the boot account says the boot failed, and at its timeout otherwise', async () => {
    const stats = async () => [stat('api', '10.0.0.3', 'stopped')];
    expect(
      await waitForPools({ backendIds: ['api'], address: '10.0.0.3', want: 'serving', stats, timeoutMs: 60_000, failed: async () => true }),
    ).toBe('failed');
    let now = 0;
    const outcome = await waitForPools({
      backendIds: ['api'],
      address: '10.0.0.3',
      want: 'serving',
      stats: async () => Promise.reject(new Error('stats unreadable')),
      timeoutMs: 9_000,
      now: () => now,
      sleep: async (ms) => {
        now += ms;
      },
    });
    expect([outcome, now]).toEqual(['timeout', 9_000]);
  });
});
