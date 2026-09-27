import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getAttachments, getConnectedApps, revokeConnectedApp, updateOrganization } from 'sdk';
import { hierarchy } from 'shared';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { oidcPayloadsTable } from '#/modules/oauth-server/oidc-payloads-db';
import { resourceUri } from '#/modules/oauth-server/resources';
import { verifyAccessToken } from '#/modules/oauth-server/verify-access-token';
import { defaultHeaders } from './fixtures';
import { createTestOrganization } from './helpers';
import {
  authorizationCodeToken,
  bearerHeaders,
  clientCredentialsToken,
  serveClientMetadataDocuments,
  serviceAccountWithKey,
  startTestOauthServer,
  type TestOauthServer,
} from './oauth-helpers';
import { clearSecurityTestData, createOrgUser } from './security/helpers';
import { createAppClient } from './test-client';

const adminRole = hierarchy.getMostPrivilegedRole('organization');

describe('OAuth authorization server', async () => {
  const call = await createAppClient();
  let oauth: TestOauthServer;

  beforeAll(async () => {
    oauth = await startTestOauthServer();
  });

  afterAll(async () => await oauth.close());

  afterEach(async () => await clearSecurityTestData());

  async function orgWithAdmin() {
    const org = await createTestOrganization();
    const user = await createOrgUser(call, org.tenantId, org.id, `admin-${nanoid(8)}`, adminRole);
    return { org, user, headers: { ...defaultHeaders, Cookie: user.sessionCookie } };
  }

  /** An organization with its admin, and a service account there whose key is its client secret (D12). */
  async function serviceAccountClient() {
    const ctx = await orgWithAdmin();
    return { ...ctx, ...(await serviceAccountWithKey(ctx.org, ctx.user.sessionCookie)) };
  }

  const clientCredentials = (client: { clientId: string; clientSecret: string }, params: Record<string, string>) =>
    clientCredentialsToken(oauth.issuer, client, params);

  it('publishes discovery metadata with the configured issuer and JWKS', async () => {
    const response = await fetch(`${oauth.issuer}/.well-known/oauth-authorization-server`);
    expect(response.status).toBe(200);
    const metadata = (await response.json()) as Record<string, unknown>;
    expect(metadata.grant_types_supported).toEqual(
      expect.arrayContaining(['authorization_code', 'refresh_token', 'client_credentials']),
    );
    expect(metadata.code_challenge_methods_supported).toEqual(['S256']);
    expect(metadata.client_id_metadata_document_supported).toBe(true);

    const jwks = await fetch(`${oauth.issuer}/jwks`).then(
      (r) => r.json() as Promise<{ keys: { kid: string; d?: string }[] }>,
    );
    expect(jwks.keys.length).toBeGreaterThanOrEqual(2);
    expect(jwks.keys.every((key) => !key.d)).toBe(true);
  });

  it('issues a client_credentials token to a service account, bound to a tenant resource', async () => {
    const client = await serviceAccountClient();
    const resource = resourceUri({ face: 'api', tenantId: client.org.tenantId });
    const { status, body } = await clientCredentials(client, { scope: 'attachment:read', resource });
    expect(status).toBe(200);
    expect(body.token_type).toBe('Bearer');

    const token = await verifyAccessToken(String(body.access_token), { tenantId: client.org.tenantId });
    expect(token).toMatchObject({
      kind: 'service',
      actorId: client.clientId,
      tenantId: client.org.tenantId,
      scopes: ['attachment:read'],
    });
  });

  it('refuses a wrong client secret and a resource outside this deployment', async () => {
    const client = await serviceAccountClient();
    const resource = resourceUri({ face: 'api', tenantId: client.org.tenantId });

    const wrongSecret = await clientCredentials({ ...client, clientSecret: `${client.clientSecret}x` }, { resource });
    expect(wrongSecret.status).toBe(401);
    expect(wrongSecret.body.error).toBe('invalid_client');

    const foreign = await clientCredentials(client, { resource: 'https://elsewhere.example/t/x' });
    expect(foreign.status).toBe(400);
    expect(foreign.body.error).toBe('invalid_target');
  });

  it('authenticates the token at the API as the service account, masked by the token scopes', async () => {
    const client = await serviceAccountClient();
    const resource = resourceUri({ face: 'api', tenantId: client.org.tenantId });
    const { body } = await clientCredentials(client, { scope: 'attachment:read', resource });
    const jwt = String(body.access_token);

    const read = await call(getAttachments, {
      path: { tenantId: client.org.tenantId, organizationId: client.org.id },
      headers: bearerHeaders(jwt),
    });
    expect(read.response.status).toBe(200);

    // The account is an admin, the token only carries attachment:read: under that mask it cannot read the
    // organization, which therefore reads as missing.
    const write = await call(updateOrganization, {
      path: { tenantId: client.org.tenantId, id: client.org.id },
      body: { name: 'Should not happen' },
      headers: bearerHeaders(jwt),
    });
    expect(write.response.status).toBe(404);

    const otherTenant = await call(getAttachments, {
      path: { tenantId: 'other01', organizationId: client.org.id },
      headers: bearerHeaders(jwt),
    });
    expect(otherTenant.response.status).toBe(401);
  });

  it('takes a client identified by its metadata document through consent to a token', async () => {
    const clientId = 'https://mcp-client.example/metadata.json';
    const redirectUri = 'http://localhost:9999/callback';
    const restore = serveClientMetadataDocuments({
      [clientId]: {
        client_name: 'MCP client',
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
      },
    });
    try {
      const { org, user } = await orgWithAdmin();
      const resource = resourceUri({ face: 'mcp', tenantId: org.tenantId, organizationId: org.id });
      const result = await authorizationCodeToken(oauth.issuer, {
        clientId,
        redirectUri,
        scope: 'attachment:read',
        resource,
        sessionCookie: user.sessionCookie,
      });
      expect(result.consent).toMatchObject({ client: { id: clientId, kind: 'cimd' }, refusal: null });
      expect(result.status).toBe(200);
      const token = await verifyAccessToken(String(result.body.access_token), {
        tenantId: org.tenantId,
        organizationId: org.id,
      });
      expect(token).toMatchObject({ kind: 'user', actorId: user.id, clientId, scopes: ['attachment:read'] });
    } finally {
      restore();
    }
  });

  it('lists a consent as a connected app and revokes it with its tokens', async () => {
    const { org, user, headers } = await orgWithAdmin();
    const resource = resourceUri({ face: 'mcp', tenantId: org.tenantId, organizationId: org.id });
    const grant = new oauth.provider.Grant({ accountId: user.id, clientId: 'https://client.example/metadata.json' });
    grant.addResourceScope(resource, 'attachment:read attachment:write');
    const grantId = await grant.save();
    const refresh = new oauth.provider.RefreshToken({
      accountId: user.id,
      // The provider's Client class is not constructible outside its own lifecycle; the model reads only clientId.
      client: { clientId: grant.clientId } as never,
      grantId,
      gty: 'authorization_code',
      scope: 'attachment:read',
    });
    await refresh.save();

    const listed = await call(getConnectedApps, { headers });
    expect(listed.response.status).toBe(200);
    const { items } = listed.data as { items: { id: string; scopes: string[]; resources: string[] }[] };
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: grantId, resources: [resource] });
    expect(items[0].scopes.sort()).toEqual(['attachment:read', 'attachment:write']);

    const revoked = await call(revokeConnectedApp, { path: { id: grantId }, headers });
    expect(revoked.response.status).toBe(200);

    const rows = await db.select().from(oidcPayloadsTable).where(eq(oidcPayloadsTable.grantId, grantId));
    expect(rows).toHaveLength(0);
    expect(await oauth.provider.Grant.find(grantId)).toBeUndefined();
  });
});
