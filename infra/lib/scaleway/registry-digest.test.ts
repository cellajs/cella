import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { FetchLike } from '../utils/fetch-like';
import { parseBearerChallenge, resolveImageDigest } from './registry-digest';

const MANIFEST = JSON.stringify({ schemaVersion: 2, manifests: [{ digest: 'sha256:inner' }] });
const MANIFEST_DIGEST = `sha256:${createHash('sha256').update(MANIFEST).digest('hex')}`;

interface MockResponse {
  status: number;
  body?: string;
  headers?: Record<string, string>;
}

function makeFetch(routes: Array<{ match: string; response: MockResponse }>): FetchLike {
  return vi.fn(async (url: string) => {
    const route = routes.find((r) => url.includes(r.match));
    if (!route) return { ok: false, status: 599, text: async () => `no mock for ${url}` };
    const { status, body = '', headers = {} } = route.response;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => body,
      headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    };
  });
}

const baseOpts = {
  registry: 'rg.fr-par.scw.cloud/my-ns',
  image: 'infra-boot',
  tag: 'abc123',
  secretKey: 'scw-secret',
};

describe('parseBearerChallenge', () => {
  it('parses realm, service, and scope from a bearer challenge', () => {
    const parsed = parseBearerChallenge(
      'Bearer realm="https://auth.example/token",service="registry",scope="repository:x:pull"',
    );
    expect(parsed).toEqual({ realm: 'https://auth.example/token', service: 'registry', scope: 'repository:x:pull' });
  });

  it('returns undefined for non-bearer or realm-less headers', () => {
    expect(parseBearerChallenge('Basic realm="x"')).toBeUndefined();
    expect(parseBearerChallenge('Bearer error="invalid_token"')).toBeUndefined();
    expect(parseBearerChallenge('')).toBeUndefined();
  });
});

describe('resolveImageDigest', () => {
  it('hashes the manifest bytes fetched with basic auth', async () => {
    const fetchImpl = makeFetch([
      { match: '/v2/my-ns/infra-boot/manifests/abc123', response: { status: 200, body: MANIFEST } },
    ]);

    await expect(resolveImageDigest({ ...baseOpts, fetchImpl })).resolves.toBe(MANIFEST_DIGEST);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://rg.fr-par.scw.cloud/v2/my-ns/infra-boot/manifests/abc123',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: expect.stringMatching(/^Basic /) }),
      }),
    );
  });

  it('performs the token exchange on a 401 bearer challenge and retries', async () => {
    let manifestCalls = 0;
    const fetchImpl: FetchLike = async (url, init) => {
      if (url.includes('/manifests/')) {
        manifestCalls += 1;
        if (manifestCalls === 1) {
          return {
            ok: false,
            status: 401,
            text: async () => '',
            headers: {
              get: (n: string) =>
                n === 'www-authenticate' ? 'Bearer realm="https://auth.scw/token",service="registry"' : null,
            },
          };
        }
        expect(init?.headers?.Authorization).toBe('Bearer tok-1');
        return { ok: true, status: 200, text: async () => MANIFEST };
      }
      if (url.startsWith('https://auth.scw/token')) {
        expect(url).toContain('service=registry');
        expect(url).toContain('scope=repository%3Amy-ns%2Finfra-boot%3Apull');
        return { ok: true, status: 200, text: async () => JSON.stringify({ token: 'tok-1' }) };
      }
      return { ok: false, status: 599, text: async () => 'unexpected' };
    };

    await expect(resolveImageDigest({ ...baseOpts, fetchImpl })).resolves.toBe(MANIFEST_DIGEST);
    expect(manifestCalls).toBe(2);
  });

  it('throws when the tag does not exist', async () => {
    const fetchImpl = makeFetch([{ match: '/manifests/', response: { status: 404, body: 'not found' } }]);
    await expect(resolveImageDigest({ ...baseOpts, fetchImpl })).rejects.toThrow(/status 404/);
  });

  it('throws on a 401 without a bearer challenge', async () => {
    const fetchImpl = makeFetch([{ match: '/manifests/', response: { status: 401 } }]);
    await expect(resolveImageDigest({ ...baseOpts, fetchImpl })).rejects.toThrow(/no bearer challenge/);
  });

  it('throws when the token exchange fails', async () => {
    const fetchImpl = makeFetch([
      {
        match: '/manifests/',
        response: { status: 401, headers: { 'www-authenticate': 'Bearer realm="https://auth.scw/token"' } },
      },
      { match: 'auth.scw/token', response: { status: 403 } },
    ]);
    await expect(resolveImageDigest({ ...baseOpts, fetchImpl })).rejects.toThrow(/token exchange failed/);
  });
});
