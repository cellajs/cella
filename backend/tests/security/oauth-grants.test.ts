import { and, eq, inArray } from 'drizzle-orm';
import { importJWK, SignJWT } from 'jose';
import { nanoid } from 'nanoid';
import {
  createApiKey,
  createServiceAccount,
  deleteMe,
  deleteUsers,
  getAttachments,
  getConnectedApps,
  revokeApiKey,
  revokeConnectedApp,
  updateServiceAccount,
} from 'sdk';
import { appConfig } from 'shared';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { DrizzleAdapter } from '#/modules/oauth-server/adapter';
import { loadSigningJwks } from '#/modules/oauth-server/keystore';
import { oauthClientsTable } from '#/modules/oauth-server/oauth-clients-db';
import { oidcPayloadsTable } from '#/modules/oauth-server/oidc-payloads-db';
import { resourceUri } from '#/modules/oauth-server/resources';
import { verifyAccessToken } from '#/modules/oauth-server/verify-access-token';
import { serviceAccountsTable } from '#/modules/service-accounts/service-accounts-db';
import { normalizeRestrictions } from '#/modules/tenants/tenant-restrictions';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { usersTable } from '#/modules/user/user-db';
import { hashToken } from '#/utils/hash-token';
import { defaultHeaders } from '../fixtures';
import { createSystemAdminUser, createTestOrganization, createTestSession, type ErrorResponse } from '../helpers';
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

const bearer = (jwt: string) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` });
const reasonOf = (error: unknown) => (error as ErrorResponse).meta?.reason;

/** A user's grants with the codes and refresh tokens issued under them (the provider's sessions are left out). */
const grantRowsOf = (userId: string) =>
  db
    .select({ type: oidcPayloadsTable.type })
    .from(oidcPayloadsTable)
    .where(
      and(
        eq(oidcPayloadsTable.accountId, userId),
        inArray(oidcPayloadsTable.type, ['Grant', 'AuthorizationCode', 'RefreshToken']),
      ),
    );

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

  const readAttachments = (ctx: Tenant, jwt: string) =>
    call(getAttachments, { path: { tenantId: ctx.org.tenantId, organizationId: ctx.org.id }, headers: bearer(jwt) });

  async function allowUnregisteredClients(tenantId: string, allow: boolean) {
    const [tenant] = await db
      .select({ restrictions: tenantsTable.restrictions })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantId));
    await db
      .update(tenantsTable)
      .set({ restrictions: { ...normalizeRestrictions(tenant.restrictions), allowUnregisteredClients: allow } })
      .where(eq(tenantsTable.id, tenantId));
    invalidateCache.tenant(tenantId);
  }

  describe('a grant ends with what it rests on', () => {
    it('must not keep a grant alive via refresh after its app is uninstalled', async () => {
      const ctx = await tenantWithApp();
      const grant = await consent(ctx);

      // Positive control: while the app is installed, the refresh token rotates.
      const rotated = await refresh(grant.refresh);
      expect(rotated.status).toBe(200);

      const uninstalled = await call(updateServiceAccount, {
        path: { tenantId: ctx.org.tenantId, organizationId: ctx.org.id, id: ctx.installationId },
        body: { status: 'disabled' },
        headers: ctx.adminHeaders,
      });
      expect(uninstalled.response.status).toBe(200);

      const read = await readAttachments(ctx, String(rotated.body.access_token));
      expect(read.response.status).toBe(401);
      expect(reasonOf(read.error)).toBe('app_not_installed');

      const refused = await refresh(String(rotated.body.refresh_token));
      expect(refused.status).toBe(400);
      expect(refused.body.error).toBe('invalid_grant');
      // The refused grant is deleted with every token issued under it: the client must ask the person again.
      expect(await grantRowsOf(ctx.member.id)).toEqual([]);
    });

    it('must not keep a deleted account acting via its grant', async () => {
      const ctx = await tenantWithApp();
      const grant = await consent(ctx);
      // Positive control, which also caches the grant's verdict at the guard.
      expect((await readAttachments(ctx, grant.access)).response.status).toBe(200);

      const deleted = await call(deleteMe, { headers: { ...defaultHeaders, Cookie: ctx.member.sessionCookie } });
      expect(deleted.response.status).toBe(204);

      expect(await grantRowsOf(ctx.member.id)).toEqual([]);
      const refused = await refresh(grant.refresh);
      expect(refused.status).toBe(400);
      expect(refused.body.error).toBe('invalid_grant');
      const read = await readAttachments(ctx, grant.access);
      expect(read.response.status).toBe(401);
      expect(reasonOf(read.error)).toBe('grant_revoked');
    });

    it('must not keep an account a system admin deleted acting via its grant', async () => {
      const ctx = await tenantWithApp();
      const grant = await consent(ctx);
      expect((await readAttachments(ctx, grant.access)).response.status).toBe(200);

      const sysAdmin = await createSystemAdminUser(`sysadmin-${nanoid(8)}@security-test.com`);
      const deleted = await call(deleteUsers, {
        body: { ids: [ctx.member.id] },
        headers: { ...defaultHeaders, Cookie: await createTestSession(sysAdmin) },
      });
      expect(deleted.response.status).toBe(200);

      expect(await grantRowsOf(ctx.member.id)).toEqual([]);
      expect((await refresh(grant.refresh)).body.error).toBe('invalid_grant');
      const read = await readAttachments(ctx, grant.access);
      expect(read.response.status).toBe(401);
      expect(reasonOf(read.error)).toBe('grant_revoked');
    });

    it('must not refresh the grant of a deleted user via a deletion path that skips the account routes', async () => {
      const ctx = await tenantWithApp();
      const grant = await consent(ctx);
      const rotated = await refresh(grant.refresh);
      expect(rotated.status).toBe(200);

      // A deletion that skips the account routes: the actor row outlives the user, the grant rows stay.
      await db.delete(usersTable).where(eq(usersTable.id, ctx.member.id));
      expect(await grantRowsOf(ctx.member.id)).not.toEqual([]);

      const read = await readAttachments(ctx, String(rotated.body.access_token));
      expect(read.response.status).toBe(401);
      expect(reasonOf(read.error)).toBe('unknown_user');

      const refused = await refresh(String(rotated.body.refresh_token));
      expect(refused.status).toBe(400);
      expect(refused.body.error).toBe('invalid_grant');
      expect(await grantRowsOf(ctx.member.id)).toEqual([]);
    });

    it("must not keep an unregistered client's grant via refresh after the tenant stops allowing such clients", async () => {
      const ctx = await tenantWithApp({ installed: false });
      const grant = await consent(ctx, CIMD_ID);
      const rotated = await refresh(grant.refresh, CIMD_ID);
      expect(rotated.status).toBe(200);

      await allowUnregisteredClients(ctx.org.tenantId, false);

      const read = await readAttachments(ctx, String(rotated.body.access_token));
      expect(read.response.status).toBe(401);
      expect(reasonOf(read.error)).toBe('unregistered_clients_not_allowed');

      const refused = await refresh(String(rotated.body.refresh_token), CIMD_ID);
      expect(refused.status).toBe(400);
      expect(refused.body.error).toBe('invalid_grant');
      expect(await grantRowsOf(ctx.member.id)).toEqual([]);
    });

    it('must not act via an access token after the person revokes the connected app', async () => {
      const ctx = await tenantWithApp();
      const grant = await consent(ctx);
      const memberHeaders = { ...defaultHeaders, Cookie: ctx.member.sessionCookie };
      expect((await readAttachments(ctx, grant.access)).response.status).toBe(200);

      const listed = await call(getConnectedApps, { headers: memberHeaders });
      const [app] = (listed.data as { items: { id: string }[] }).items;
      const revoked = await call(revokeConnectedApp, { path: { id: app.id }, headers: memberHeaders });
      expect(revoked.response.status).toBe(200);

      const read = await readAttachments(ctx, grant.access);
      expect(read.response.status).toBe(401);
      expect(reasonOf(read.error)).toBe('grant_revoked');
    });
  });

  describe('a service token follows its API key', () => {
    it('must not act via a service token after its API key is revoked, even while its verdict is cached', async () => {
      const org = await createTestOrganization();
      const admin = await createOrgUser(call, org.tenantId, org.id, `admin-${nanoid(8)}`, 'admin');
      const headers = { ...defaultHeaders, Cookie: admin.sessionCookie };
      const path = { tenantId: org.tenantId, organizationId: org.id };
      const { data } = await call(createServiceAccount, {
        path,
        body: { name: 'Sync bot', role: 'admin', key: { name: 'first', scopes: null } },
        headers,
      });
      const created = data as { serviceAccount: { id: string }; apiKey: { id: string; secret: string } };
      const accountId = created.serviceAccount.id;
      const second = await call(createApiKey, { path: { ...path, id: accountId }, body: { name: 'second' }, headers });
      const secondKey = second.data as { secret: string };

      const resource = resourceUri({ face: 'api', tenantId: org.tenantId });
      const tokenFor = async (clientSecret: string) => {
        const minted = await clientCredentialsToken(
          oauth.issuer,
          { clientId: accountId, clientSecret },
          { scope: 'attachment:read', resource },
        );
        expect(minted.status).toBe(200);
        return String(minted.body.access_token);
      };
      const read = (jwt: string) => call(getAttachments, { path, headers: bearer(jwt) });

      const jwt = await tokenFor(created.apiKey.secret);
      expect((await read(jwt)).response.status).toBe(200);

      const revoked = await call(revokeApiKey, { path: { ...path, id: accountId, keyId: created.apiKey.id }, headers });
      expect(revoked.response.status).toBe(200);

      const refused = await read(jwt);
      expect(refused.response.status).toBe(401);
      expect(reasonOf(refused.error)).toBe('invalid_api_key');
      // Positive control: the account and its other key are untouched.
      expect((await read(await tokenFor(secondKey.secret))).response.status).toBe(200);
    });

    it('must not skip the grant check via a token that names no grant or API key', async () => {
      const ctx = await tenantWithApp();
      const grant = await consent(ctx);
      // Positive control: the server's own token names its grant and passes.
      expect((await readAttachments(ctx, grant.access)).response.status).toBe(200);

      const { data } = await call(createServiceAccount, {
        path: { tenantId: ctx.org.tenantId, organizationId: ctx.org.id },
        body: { name: 'Sync bot', role: 'admin' },
        headers: ctx.adminHeaders,
      });
      const accountId = (data as { serviceAccount: { id: string } }).serviceAccount.id;

      // Signed with the server's own key and otherwise well-formed: only the grant and key ids are missing.
      const [signingJwk] = (await loadSigningJwks()).keys;
      const key = await importJWK(signingJwk, 'RS256');
      const sign = (claims: Record<string, unknown>, sub: string) =>
        new SignJWT({ tenant_id: ctx.org.tenantId, scope: 'attachment:read', ...claims })
          .setProtectedHeader({ alg: 'RS256', kid: signingJwk.kid, typ: 'at+jwt' })
          .setSubject(sub)
          .setIssuer(appConfig.oauthUrl)
          .setAudience(ctx.resource)
          .setIssuedAt()
          .setExpirationTime('1h')
          .sign(key);

      for (const jwt of [
        await sign({ actor_kind: 'user', client_id: APP_ID }, ctx.member.id),
        await sign({ actor_kind: 'service', client_id: accountId }, accountId),
      ]) {
        const read = await readAttachments(ctx, jwt);
        expect(read.response.status).toBe(401);
        expect(reasonOf(read.error)).toBe('invalid_token');
      }
    });
  });

  describe('codes and refresh tokens are single use', () => {
    it('must not mint tokens twice via a replayed code, and the replay revokes the grant', async () => {
      const ctx = await tenantWithApp();
      const { code, verifier } = await authorizationCode(oauth.issuer, authorization(ctx));
      const exchange = () =>
        exchangeCode(oauth.issuer, { clientId: APP_ID, redirectUri: REDIRECT_URI, code: code ?? '', verifier });

      const first = await exchange();
      expect(first.status).toBe(200);
      const access = String(first.body.access_token);
      // Positive control: the token itself verifies; any refusal below is the grant's.
      await expect(
        verifyAccessToken(access, { tenantId: ctx.org.tenantId, organizationId: ctx.org.id }),
      ).resolves.toBeTruthy();

      const replay = await exchange();
      expect(replay.status).toBe(400);
      expect(replay.body.error).toBe('invalid_grant');

      expect(await grantRowsOf(ctx.member.id)).toEqual([]);
      const read = await readAttachments(ctx, access);
      expect(read.response.status).toBe(401);
      expect(reasonOf(read.error)).toBe('grant_revoked');
      expect((await refresh(String(first.body.refresh_token))).body.error).toBe('invalid_grant');
    });

    it('must not mint tokens via a rotated refresh token, and the replay revokes the grant', async () => {
      const ctx = await tenantWithApp();
      const grant = await consent(ctx);

      const rotated = await refresh(grant.refresh);
      expect(rotated.status).toBe(200);
      const access = String(rotated.body.access_token);

      const replay = await refresh(grant.refresh);
      expect(replay.status).toBe(400);
      expect(replay.body.error).toBe('invalid_grant');

      expect(await grantRowsOf(ctx.member.id)).toEqual([]);
      expect((await refresh(String(rotated.body.refresh_token))).body.error).toBe('invalid_grant');
      const read = await readAttachments(ctx, access);
      expect(read.response.status).toBe(401);
      expect(reasonOf(read.error)).toBe('grant_revoked');
    });

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

  describe('consent', () => {
    it('must not grant consent via a posted accept despite a refusal', async () => {
      const installed = await tenantWithApp();
      const uninstalled = await tenantWithApp({ installed: false });
      await allowUnregisteredClients(uninstalled.org.tenantId, false);

      const cases = [
        {
          refusal: 'not_a_member',
          input: authorization(installed, APP_ID, uninstalled.member),
          user: uninstalled.member,
        },
        { refusal: 'app_not_installed', input: authorization(uninstalled), user: uninstalled.member },
        {
          refusal: 'unregistered_clients_not_allowed',
          input: authorization(uninstalled, CIMD_ID),
          user: uninstalled.member,
        },
      ];
      for (const { refusal, input, user } of cases) {
        const result = await authorizationCode(oauth.issuer, input);
        expect(result.consent.refusal).toBe(refusal);
        expect(result.code).toBeNull();
        expect(result.failure?.body).toMatchObject({ error: 'access_denied', error_description: refusal });
        expect(await grantRowsOf(user.id)).toEqual([]);
      }

      // Positive control: the same accept for an installed app and a member yields a code.
      const allowed = await authorizationCode(oauth.issuer, authorization(installed));
      expect(allowed.consent.refusal).toBeNull();
      expect(allowed.code).toBeTruthy();
    });

    it('must not show a logo or name via the metadata document of an unregistered client', async () => {
      const ctx = await tenantWithApp();

      const unregistered = await authorizationCode(oauth.issuer, authorization(ctx, CIMD_ID));
      expect(unregistered.consent.client).toEqual({
        id: CIMD_ID,
        name: 'mcp-client.example',
        logoUri: null,
        kind: 'cimd',
      });

      // Positive control: a registered app keeps the name and logo a system admin set.
      const registered = await authorizationCode(oauth.issuer, authorization(ctx));
      expect(registered.consent.client).toEqual({
        id: APP_ID,
        name: 'Portfolio',
        logoUri: APP_LOGO,
        kind: 'registered',
      });
    });
  });
});
