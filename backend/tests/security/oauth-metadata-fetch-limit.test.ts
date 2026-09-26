import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { createServiceAccount } from 'sdk';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { clientMetadataFetchLimiter } from '#/middlewares/rate-limiter/limiters';
import { oauthClientsTable } from '#/modules/oauth-server/oauth-clients-db';
import { resourceUri } from '#/modules/oauth-server/resources';
import { serviceAccountsTable } from '#/modules/service-accounts/service-accounts-db';
import { defaultHeaders } from '../fixtures';
import { createTestOrganization } from '../helpers';
import { authorizationCodeToken, CookieJar, startTestOauthServer, type TestOauthServer } from '../oauth-helpers';
import { createAppClient } from '../test-client';
import { clearSecurityTestData, createOrgUser } from './helpers';

// The suite mocks every limiter as a pass-through (tests/setup.ts); this file needs the real one.
vi.unmock('#/middlewares/rate-limiter/core');

const FLOODED_HOST = 'metadata-flood.example';
const CIMD_ID = 'https://mcp-client.example/oauth/client.json';
/** A client whose document also names a sector identifier, and that sector document. */
const SECTOR_CLIENT_ID = 'https://sector-client.example/oauth/client.json';
const SECTOR_URI = 'https://sector-target.example/sector.json';
const APP_ID = 'fetch-budget-portfolio';
const REDIRECT_URI = 'http://localhost:9999/callback';

/** The MCP client's own metadata document, served at `CIMD_ID` without cache headers. */
const cimdDocument = {
  client_id: CIMD_ID,
  client_name: 'MCP client',
  redirect_uris: [REDIRECT_URI],
  token_endpoint_auth_method: 'none',
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
};

/** A fresh client address per test: limiter rows outlive a run, and the IP-keyed budgets must start empty. */
const randomIp = () => `203.0.${Math.floor(Math.random() * 256)}.${1 + Math.floor(Math.random() * 254)}`;

/**
 * A client id the authorization server has not cached may be the URL of a metadata document it fetches, so a request
 * can make the server send one of its own to a host the requester picks. A per-address budget bounds those fetches,
 * and only those: a known client's token requests fetch nothing and never count.
 */
describe('authorization server fetch budget', async () => {
  const call = await createAppClient();
  let oauth: TestOauthServer;
  /** The metadata documents the server set out to fetch, from the flooded host or the MCP client's. */
  const fetched: string[] = [];

  beforeAll(async () => {
    oauth = await startTestOauthServer();
    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url === CIMD_ID || url === SECTOR_CLIENT_ID) {
        fetched.push(url);
        const document = {
          ...cimdDocument,
          client_id: url,
          ...(url === SECTOR_CLIENT_ID && { sector_identifier_uri: SECTOR_URI }),
        };
        return new Response(JSON.stringify(document), { headers: { 'content-type': 'application/json' } });
      }
      if (url === SECTOR_URI) {
        fetched.push(url);
        return new Response(JSON.stringify([REDIRECT_URI]), { headers: { 'content-type': 'application/json' } });
      }
      if (!new URL(url).hostname.endsWith(FLOODED_HOST)) return realFetch(input, init);
      fetched.push(url);
      return new Response('not found', { status: 404 });
    });
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await oauth.close();
  });
  afterEach(async () => await clearSecurityTestData());

  const origin = () => new URL(oauth.issuer).origin;

  /** An authorization request for `clientId`, as its browser sends it from `ip`. */
  const authorize = (ip: string, clientId: string, { resource = '', cookie = '' } = {}) => {
    const url = new URL(`${oauth.issuer}/auth`);
    url.search = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      scope: 'attachment:read',
      ...(resource && { resource }),
      code_challenge: 'x'.repeat(43),
      code_challenge_method: 'S256',
    }).toString();
    return fetch(url, { redirect: 'manual', headers: { 'x-forwarded-for': ip, ...(cookie && { Cookie: cookie }) } });
  };

  /** A client id the server has never seen, whose document it can only fetch. */
  const firstTimeClient = (n: number) => `https://client-${n}-${nanoid(6)}.${FLOODED_HOST}/metadata.json`;

  /** Sends first-time client ids from `ip` until the server refuses; returns the refusal. */
  async function spendBudget(ip: string) {
    // An unknown client costs two fetches per authorization request (the client check and the error page's second
    // look), so the budget runs out within as many requests as it allows fetches.
    for (let n = 0; n <= clientMetadataFetchLimiter.points; n++) {
      const response = await authorize(ip, firstTimeClient(n));
      if (response.status === 429) return response;
    }
    throw new Error('The budget was never spent');
  }

  /** A person's grant to `clientId` in a fresh tenant, from the consent page; returns its refresh token. */
  async function grantTo(clientId: string) {
    const org = await createTestOrganization();
    const member = await createOrgUser(call, org.tenantId, org.id, `member-${nanoid(8)}`);
    if (clientId === APP_ID) {
      // A registered app acts in a tenant only where an admin installed it.
      const admin = await createOrgUser(call, org.tenantId, org.id, `admin-${nanoid(8)}`, 'admin');
      await db
        .insert(oauthClientsTable)
        .values({ id: APP_ID, name: 'Portfolio', redirectUris: [REDIRECT_URI] })
        .onConflictDoNothing();
      const { data } = await call(createServiceAccount, {
        path: { tenantId: org.tenantId, organizationId: org.id },
        body: { name: 'Portfolio installation', role: 'member' },
        headers: { ...defaultHeaders, Cookie: admin.sessionCookie },
      });
      const installationId = (data as { serviceAccount: { id: string } }).serviceAccount.id;
      await db
        .update(serviceAccountsTable)
        .set({ oauthClientId: APP_ID })
        .where(eq(serviceAccountsTable.id, installationId));
    }
    const granted = await authorizationCodeToken(oauth.issuer, {
      clientId,
      redirectUri: REDIRECT_URI,
      scope: 'attachment:read',
      resource: resourceUri({ face: 'mcp', tenantId: org.tenantId, organizationId: org.id }),
      sessionCookie: member.sessionCookie,
    });
    expect(granted.status).toBe(200);
    return String(granted.body.refresh_token);
  }

  /** The refresh_token grant of a public client, sent from `ip`. */
  async function refreshFrom(ip: string, clientId: string, refreshToken: string) {
    const response = await fetch(`${oauth.issuer}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'x-forwarded-for': ip },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId }),
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  }

  it('must not fetch more metadata documents than the budget via first-time client ids', async () => {
    const ip = randomIp();
    const before = fetched.length;

    const refused = await spendBudget(ip);
    expect(refused.headers.get('retry-after')).toBeTruthy();
    expect(await refused.json()).toMatchObject({ error: 'too_many_requests' });
    const sentOut = fetched.length - before;
    expect(sentOut).toBeGreaterThan(0);
    expect(sentOut).toBeLessThanOrEqual(clientMetadataFetchLimiter.points);

    // Spent: first-time client ids fetch nothing more, at the authorization endpoint or at the token endpoint.
    expect((await authorize(ip, firstTimeClient(1000))).status).toBe(429);
    const token = await fetch(`${oauth.issuer}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'x-forwarded-for': ip },
      body: new URLSearchParams({ grant_type: 'authorization_code', code: 'code', client_id: firstTimeClient(1001) }),
    });
    expect(token.status).toBe(429);
    expect(await token.json()).toMatchObject({ error: 'too_many_requests' });
    expect(fetched.length - before).toBe(sentOut);

    // Positive control: another address still reaches the server, and its document is fetched.
    expect((await authorize(randomIp(), firstTimeClient(1002))).status).not.toBe(429);
    expect(fetched.length - before).toBeGreaterThan(sentOut);
  });

  it('must not fetch client metadata documents without limit via the consent page', async () => {
    const org = await createTestOrganization();
    const member = await createOrgUser(call, org.tenantId, org.id, `member-${nanoid(8)}`);
    const resource = resourceUri({ face: 'mcp', tenantId: org.tenantId, organizationId: org.id });
    const ip = randomIp();

    // The MCP client's authorization request: its document is fetched, and the browser lands on the consent page.
    const browser = new CookieJar([member.sessionCookie]);
    const start = await authorize(ip, CIMD_ID, { resource, cookie: browser.header() });
    browser.absorb(start);
    const uid = /\/oauth\/interaction\/([^/?]+)/.exec(start.headers.get('location') ?? '')?.[1];
    expect(uid).toBeTruthy();
    await spendBudget(ip);

    // Past the provider's cache of the document (30 seconds), the consent page resolves the client again.
    const realNow = Date.now.bind(Date);
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => realNow() + 31_000);
    try {
      const before = fetched.length;
      const details = (from: string) =>
        fetch(`${origin()}/oauth/interaction/${uid}/details`, {
          headers: { Cookie: browser.header(), 'x-forwarded-for': from },
        });

      const refused = await details(ip);
      expect(refused.status).toBe(429);
      expect(refused.headers.get('retry-after')).toBeTruthy();
      expect(await refused.json()).toMatchObject({ type: 'too_many_requests' });
      expect(fetched.length).toBe(before);

      // Positive control: from another address the page fetches the document again and shows the consent.
      expect((await details(randomIp())).status).toBe(200);
      expect(fetched).toHaveLength(before + 1);
    } finally {
      clock.mockRestore();
    }
  });

  it('must not fetch a sector document outside the budget via a cached metadata document', async () => {
    const ip = randomIp();
    const before = fetched.length;

    // Every use of the client resolves it again; only its own document is fetched, once, from the budget.
    for (let n = 0; n < 5; n++) expect((await authorize(ip, SECTOR_CLIENT_ID)).status).toBe(303);
    expect(fetched.slice(before)).toEqual([SECTOR_CLIENT_ID]);
  });

  it('lets known clients refresh from one address more often than the budget allows fetches', async () => {
    // A hosted client refreshing for many people behind one egress address, or an office behind one NAT address.
    for (const clientId of [APP_ID, CIMD_ID]) {
      let refreshToken = await grantTo(clientId);
      const ip = randomIp();
      const before = fetched.length;

      for (let n = 0; n < clientMetadataFetchLimiter.points + 5; n++) {
        const rotated = await refreshFrom(ip, clientId, refreshToken);
        expect(rotated.status, `${clientId}: refresh ${n + 1}`).toBe(200);
        refreshToken = String(rotated.body.refresh_token);
      }
      // A registered app is never fetched; the MCP client's document is cached from its authorization request.
      if (clientId === APP_ID) expect(fetched).toHaveLength(before);
    }
  });

  it('keeps the discovery document and public keys outside the budget', async () => {
    const ip = randomIp();
    await spendBudget(ip);

    const discovery = await fetch(`${oauth.issuer}/.well-known/oauth-authorization-server`, {
      headers: { 'x-forwarded-for': ip },
    });
    expect(discovery.status).toBe(200);
    expect((await fetch(`${oauth.issuer}/jwks`, { headers: { 'x-forwarded-for': ip } })).status).toBe(200);
  });
});
