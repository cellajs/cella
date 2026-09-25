import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { createServiceAccount } from 'sdk';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { DrizzleAdapter } from '#/modules/oauth-server/adapter';
import { oauthClientsTable } from '#/modules/oauth-server/oauth-clients-db';
import { oidcPayloadsTable } from '#/modules/oauth-server/oidc-payloads-db';
import { resourceUri } from '#/modules/oauth-server/resources';
import { serviceAccountsTable } from '#/modules/service-accounts/service-accounts-db';
import { hashToken } from '#/utils/hash-token';
import { defaultHeaders } from '../fixtures';
import { createTestOrganization } from '../helpers';
import {
  authorizationCode,
  authorizationCodeToken,
  clientCredentialsToken,
  exchangeCode,
  refreshAccessToken,
  serveClientMetadataDocuments,
  startTestOauthServer,
  type TestOauthServer,
} from '../oauth-helpers';
import { createAppClient } from '../test-client';
import { clearSecurityTestData, createOrgUser } from './helpers';

const REDIRECT_URI = 'http://localhost:9999/callback';
const APP_ID = 'grant-policy-portfolio';
const APP_LOGO = 'https://cdn.example/portfolio.png';
const CIMD_ID = 'https://mcp-client.example/oauth/client.json';

/** An unregistered client's own description: every property in it is the client author's choice. */
const cimdDocument = {
  client_name: 'Official Admin Console',
  logo_uri: 'https://tracker.example/pixel.png',
  redirect_uris: [REDIRECT_URI],
  token_endpoint_auth_method: 'none',
  grant_types: ['authorization_code', 'refresh_token', 'client_credentials'],
  response_types: ['code'],
  client_kind: 'registered',
};

/**
 * A grant is valid only while the grant policy says so: at consent, at every code exchange and refresh, and at the
 * guard for every access token. Codes and refresh tokens are single use and stored hashed.
 */
describe('OAuth grants', async () => {
  const call = await createAppClient();
  let oauth: TestOauthServer;
  let restoreFetch: () => void;

  beforeAll(async () => {
    oauth = await startTestOauthServer();
    restoreFetch = serveClientMetadataDocuments({ [CIMD_ID]: cimdDocument });
  });
  afterAll(async () => {
    restoreFetch();
    await oauth.close();
  });
  afterEach(async () => await clearSecurityTestData());

  /** A tenant with an admin and a member; the registered app is installed there unless `installed` is false. */
  async function tenantWithApp({ installed = true } = {}) {
    const org = await createTestOrganization();
    const admin = await createOrgUser(call, org.tenantId, org.id, `admin-${nanoid(8)}`, 'admin');
    const member = await createOrgUser(call, org.tenantId, org.id, `member-${nanoid(8)}`);
    const adminHeaders = { ...defaultHeaders, Cookie: admin.sessionCookie };
    await db
      .insert(oauthClientsTable)
      .values({ id: APP_ID, name: 'Portfolio', redirectUris: [REDIRECT_URI], logoUri: APP_LOGO })
      .onConflictDoNothing();
    let installationId = '';
    if (installed) {
      const { data } = await call(createServiceAccount, {
        path: { tenantId: org.tenantId, organizationId: org.id },
        body: { name: 'Portfolio installation', role: 'member' },
        headers: adminHeaders,
      });
      installationId = (data as { serviceAccount: { id: string } }).serviceAccount.id;
      await db
        .update(serviceAccountsTable)
        .set({ oauthClientId: APP_ID })
        .where(eq(serviceAccountsTable.id, installationId));
    }
    const resource = resourceUri({ face: 'mcp', tenantId: org.tenantId, organizationId: org.id });
    return { org, admin, member, adminHeaders, installationId, resource };
  }
  type Tenant = Awaited<ReturnType<typeof tenantWithApp>>;

  const authorization = (ctx: Tenant, clientId = APP_ID, user = ctx.member) => ({
    clientId,
    redirectUri: REDIRECT_URI,
    scope: 'attachment:read',
    resource: ctx.resource,
    sessionCookie: user.sessionCookie,
  });

  /** The member consents and the client exchanges the code. */
  async function consent(ctx: Tenant, clientId = APP_ID) {
    const result = await authorizationCodeToken(oauth.issuer, authorization(ctx, clientId));
    expect(result.status).toBe(200);
    return { access: String(result.body.access_token), refresh: String(result.body.refresh_token) };
  }

  const refresh = (refreshToken: string, clientId = APP_ID) =>
    refreshAccessToken(oauth.issuer, { clientId, refreshToken });

  describe('codes and refresh tokens are single use', () => {
    /** Holds every consume back a moment, so each racing request has read the unspent row before any spends it. */
    function widenConsumeRace() {
      const consume = DrizzleAdapter.prototype.consume;
      return vi.spyOn(DrizzleAdapter.prototype, 'consume').mockImplementation(async function (
        this: DrizzleAdapter,
        id,
      ) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return consume.call(this, id);
      });
    }

    it('must not mint tokens twice via two concurrent exchanges of one code', async () => {
      const ctx = await tenantWithApp();
      const { code, verifier } = await authorizationCode(oauth.issuer, authorization(ctx));
      const exchange = () =>
        exchangeCode(oauth.issuer, { clientId: APP_ID, redirectUri: REDIRECT_URI, code: code ?? '', verifier });

      const race = widenConsumeRace();
      const results = await Promise.all([exchange(), exchange()]).finally(() => race.mockRestore());
      expect(results.map((result) => result.status).sort()).toEqual([200, 400]);
      expect(results.find((result) => result.status === 400)?.body.error).toBe('invalid_grant');
    });

    it('must not mint tokens twice via two concurrent refreshes with one refresh token', async () => {
      const ctx = await tenantWithApp();
      const grant = await consent(ctx);

      const race = widenConsumeRace();
      const results = await Promise.all([refresh(grant.refresh), refresh(grant.refresh)]).finally(() =>
        race.mockRestore(),
      );
      expect(results.map((result) => result.status).sort()).toEqual([200, 400]);
      expect(results.find((result) => result.status === 400)?.body.error).toBe('invalid_grant');
    });

    it('must not leak a code or refresh token via a read of oidc_payloads', async () => {
      const ctx = await tenantWithApp();
      const { code, verifier } = await authorizationCode(oauth.issuer, authorization(ctx));
      const stored = async () => JSON.stringify(await db.select().from(oidcPayloadsTable));

      expect(code).toBeTruthy();
      expect(await stored()).not.toContain(code);

      const tokens = await exchangeCode(oauth.issuer, {
        clientId: APP_ID,
        redirectUri: REDIRECT_URI,
        code: code ?? '',
        verifier,
      });
      expect(tokens.status).toBe(200);
      const refreshToken = String(tokens.body.refresh_token);
      const rows = await stored();
      expect(rows).not.toContain(code);
      expect(rows).not.toContain(refreshToken);
      expect(rows).toContain(hashToken(refreshToken));

      // Positive control: the refresh token is still found, by its hash.
      expect((await refresh(refreshToken)).status).toBe(200);
    });
  });

  describe('client_credentials is for service accounts only', () => {
    it('must not mint a service token via the client_credentials grant of a registered app', async () => {
      const org = await createTestOrganization();
      const secret = `partner-secret-${nanoid(16)}`;
      await db.insert(oauthClientsTable).values({
        id: 'grant-policy-partner',
        name: 'Partner',
        redirectUris: [REDIRECT_URI],
        secretHash: hashToken(secret),
      });
      const resource = resourceUri({ face: 'api', tenantId: org.tenantId });

      const refused = await clientCredentialsToken(
        oauth.issuer,
        { clientId: 'grant-policy-partner', clientSecret: secret },
        { scope: 'organization:write', resource },
      );
      expect(refused.status).toBe(400);
      expect(refused.body.error).toBe('invalid_request');

      // Positive control: a service account's key still mints one.
      const admin = await createOrgUser(call, org.tenantId, org.id, `admin-${nanoid(8)}`, 'admin');
      const { data } = await call(createServiceAccount, {
        path: { tenantId: org.tenantId, organizationId: org.id },
        body: { name: 'Sync bot', role: 'admin', key: { name: 'key', scopes: null } },
        headers: { ...defaultHeaders, Cookie: admin.sessionCookie },
      });
      const created = data as { serviceAccount: { id: string }; apiKey: { secret: string } };
      const minted = await clientCredentialsToken(
        oauth.issuer,
        { clientId: created.serviceAccount.id, clientSecret: created.apiKey.secret },
        { scope: 'organization:write', resource },
      );
      expect(minted.status).toBe(200);
    });

    it('must not mint a service token via the client_credentials grant of a client that describes itself', async () => {
      const org = await createTestOrganization();
      const response = await fetch(`${oauth.issuer}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: CIMD_ID,
          scope: 'organization:write',
          resource: resourceUri({ face: 'api', tenantId: org.tenantId }),
        }),
      });
      expect(response.status).toBe(400);
      expect(((await response.json()) as { error: string }).error).toBe('unauthorized_client');
    });
  });
});
