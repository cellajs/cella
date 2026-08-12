import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fetchServiceKey } from './service-key';

const dir = mkdtempSync(join(tmpdir(), 'service-key-'));
const pair = { accessKey: 'SCWAK', secretKey: 'sk' };
const bundleResponse = () =>
  new Response(JSON.stringify({ data: Buffer.from(JSON.stringify(pair), 'utf-8').toString('base64') }), {
    status: 200,
  });

function options(cacheFile: string, fetchImpl: (url: string, init?: RequestInit) => Promise<Response>) {
  return {
    handoff: { secretId: 'sec-1', cacheFile },
    bootSecretKey: 'boot-secret',
    region: 'nl-ams',
    fetchImpl: fetchImpl as never,
  };
}

describe('fetchServiceKey (single-access handoff)', () => {
  it('first boot fetches the bundle once, persists it 0600, and returns the pair', async () => {
    const cacheFile = join(dir, 'first-boot.json');
    let fetches = 0;
    const result = await fetchServiceKey(
      options(cacheFile, async () => {
        fetches += 1;
        return bundleResponse();
      }),
    );
    expect(result).toEqual(pair);
    expect(fetches).toBe(1);
    expect(JSON.parse(readFileSync(cacheFile, 'utf-8'))).toEqual(pair);
    expect(statSync(cacheFile).mode & 0o777).toBe(0o600);
  });

  it('reboots are cache-first: the network is never touched', async () => {
    const cacheFile = join(dir, 'reboot.json');
    writeFileSync(cacheFile, JSON.stringify(pair));
    const result = await fetchServiceKey(
      options(cacheFile, async () => {
        throw new Error('network must not be reached on a cached boot');
      }),
    );
    expect(result).toEqual(pair);
  });

  it('a failed fetch with NO cache is the interception security signal, not a retryable error', async () => {
    const cacheFile = join(dir, 'consumed.json');
    await expect(
      fetchServiceKey(options(cacheFile, async () => new Response('gone', { status: 404 }))),
    ).rejects.toThrow(/SECURITY: service-key handoff fetch failed \(404\)/);
  });

  it('rejects a malformed bundle payload', async () => {
    const cacheFile = join(dir, 'malformed.json');
    const badBundle = new Response(JSON.stringify({ data: Buffer.from('{"nope":true}', 'utf-8').toString('base64') }), {
      status: 200,
    });
    await expect(fetchServiceKey(options(cacheFile, async () => badBundle))).rejects.toThrow(
      /does not contain \{accessKey, secretKey\}/,
    );
  });
});
