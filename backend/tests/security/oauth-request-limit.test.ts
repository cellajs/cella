import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { oauthRequestLimiter } from '#/middlewares/rate-limiter/limiters';
import { startTestOauthServer, type TestOauthServer } from '../oauth-helpers';

// The suite mocks every limiter as a pass-through (tests/setup.ts); this file needs the real one.
vi.unmock('#/middlewares/rate-limiter/core');

const FLOODED_HOST = 'metadata-flood.example';

/** A fresh client address per test: limiter rows outlive a run, and the IP-keyed budgets must start empty. */
const randomIp = () => `203.0.${Math.floor(Math.random() * 256)}.${1 + Math.floor(Math.random() * 254)}`;

/**
 * Every client id the authorization server resolves may be the URL of a metadata document it fetches, so each request
 * can make the server send one of its own to a host the requester picks. A per-address budget bounds that traffic.
 */
describe('authorization server request budget', () => {
  let oauth: TestOauthServer;
  /** The metadata documents the server set out to fetch from the flooded host. */
  const fetched: string[] = [];

  beforeAll(async () => {
    oauth = await startTestOauthServer();
    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!new URL(url).hostname.endsWith(FLOODED_HOST)) return realFetch(input, init);
      fetched.push(url);
      return new Response('not found', { status: 404 });
    });
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await oauth.close();
  });

  /** An authorization request naming a client id the server has never seen, so it fetches that client's document. */
  const authorize = (ip: string, n: number) => {
    const url = new URL(`${oauth.issuer}/auth`);
    url.search = new URLSearchParams({
      client_id: `https://client-${n}.${FLOODED_HOST}/metadata.json`,
      response_type: 'code',
      redirect_uri: 'https://client.example/callback',
      scope: 'attachment:read',
      code_challenge: 'x'.repeat(43),
      code_challenge_method: 'S256',
    }).toString();
    return fetch(url, { redirect: 'manual', headers: { 'x-forwarded-for': ip } });
  };

  it('must not fetch client metadata documents without limit via the authorization endpoint', async () => {
    const ip = randomIp();
    const budget = oauthRequestLimiter.points;

    for (let n = 0; n < budget; n++) expect((await authorize(ip, n)).status).not.toBe(429);
    // Every one of those requests sent the server out for a document (the provider looks an unknown client up twice).
    const sentOut = fetched.length;
    expect(sentOut).toBeGreaterThanOrEqual(budget);

    const refused = await authorize(ip, budget);
    expect(refused.status).toBe(429);
    expect(refused.headers.get('retry-after')).toBeTruthy();
    // The token endpoint resolves client ids the same way and shares the budget.
    const token = await fetch(`${oauth.issuer}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'x-forwarded-for': ip },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: 'code',
        client_id: `https://client-token.${FLOODED_HOST}/metadata.json`,
      }),
    });
    expect(token.status).toBe(429);
    // So do the consent page's interaction routes.
    const details = await fetch(`${new URL(oauth.issuer).origin}/oauth/interaction/any/details`, {
      headers: { 'x-forwarded-for': ip },
    });
    expect(details.status).toBe(429);
    expect(fetched).toHaveLength(sentOut);

    // Positive control: another address still reaches the server, and its document is fetched.
    expect((await authorize(randomIp(), budget + 1)).status).not.toBe(429);
    expect(fetched.length).toBeGreaterThan(sentOut);
  });

  it('keeps the discovery document and public keys outside the budget', async () => {
    const ip = randomIp();
    for (let n = 0; n <= oauthRequestLimiter.points; n++) await authorize(ip, 1000 + n);

    const discovery = await fetch(`${oauth.issuer}/.well-known/oauth-authorization-server`, {
      headers: { 'x-forwarded-for': ip },
    });
    expect(discovery.status).toBe(200);
    expect((await fetch(`${oauth.issuer}/jwks`, { headers: { 'x-forwarded-for': ip } })).status).toBe(200);
  });
});
