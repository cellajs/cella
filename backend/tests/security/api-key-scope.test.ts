import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { createServiceAccount, updateOrganization } from 'sdk';
import type { AccessScope } from 'shared';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { resourceUri } from '#/modules/oauth-server/resources';
import { verifyAccessToken } from '#/modules/oauth-server/verify-access-token';
import { organizationsTable } from '#/modules/organization/organization-db';
import { defaultHeaders } from '../fixtures';
import { createTestOrganization } from '../helpers';
import { clientCredentialsToken, startTestOauthServer, type TestOauthServer } from '../oauth-helpers';
import { createAppClient } from '../test-client';
import { clearSecurityTestData, createOrgUser } from './helpers';

const bearer = (jwt: string) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` });

/**
 * A secret key may narrow what its service account can do, never widen it. The key doubles as the account's client
 * secret at the token endpoint, so the token minted with it must stay within the key's scopes.
 */
describe('API key scopes at the token endpoint', async () => {
  const call = await createAppClient();
  let oauth: TestOauthServer;

  beforeAll(async () => {
    oauth = await startTestOauthServer();
  });
  afterAll(async () => await oauth.close());
  afterEach(async () => await clearSecurityTestData());

  /** An admin service account whose one key carries `scopes` (null: unscoped). */
  async function adminAccountWithKey(scopes: AccessScope[] | null) {
    const org = await createTestOrganization();
    const admin = await createOrgUser(call, org.tenantId, org.id, `admin-${nanoid(8)}`, 'admin');
    const { data, response } = await call(createServiceAccount, {
      path: { tenantId: org.tenantId, organizationId: org.id },
      body: { name: 'Bot', role: 'admin', key: { name: 'key', scopes } },
      headers: { ...defaultHeaders, Cookie: admin.sessionCookie },
    });
    expect(response.status).toBe(201);
    const created = data as { serviceAccount: { id: string }; apiKey: { secret: string } };
    return { org, client: { clientId: created.serviceAccount.id, clientSecret: created.apiKey.secret } };
  }

  async function tokenFor(account: Awaited<ReturnType<typeof adminAccountWithKey>>, scope: string) {
    const resource = resourceUri({ face: 'api', tenantId: account.org.tenantId });
    const { status, body } = await clientCredentialsToken(oauth.issuer, account.client, { scope, resource });
    expect(status).toBe(200);
    return String(body.access_token);
  }

  it('must not widen a read-only key to write scopes via the client_credentials grant', async () => {
    const account = await adminAccountWithKey(['attachment:read']);
    const jwt = await tokenFor(account, 'attachment:read attachment:write organization:write');

    const token = await verifyAccessToken(jwt, { tenantId: account.org.tenantId });
    expect(token.scopes).toEqual(['attachment:read']);

    const write = await call(updateOrganization, {
      path: { tenantId: account.org.tenantId, id: account.org.id },
      body: { name: 'Taken over' },
      headers: bearer(jwt),
    });
    expect(write.response.status).toBe(403);
    const [row] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, account.org.id));
    expect(row.name).toBe(account.org.name);
  });

  it('keeps read under a write scope: a write key may mint a read token', async () => {
    const account = await adminAccountWithKey(['attachment:write']);
    const token = await verifyAccessToken(
      await tokenFor(account, 'attachment:read attachment:write organization:read'),
      {
        tenantId: account.org.tenantId,
      },
    );
    expect(token.scopes.sort()).toEqual(['attachment:read', 'attachment:write']);
  });

  it('lets an unscoped key mint any scope it asks for (positive control)', async () => {
    const account = await adminAccountWithKey(null);
    const jwt = await tokenFor(account, 'organization:write');
    expect((await verifyAccessToken(jwt, { tenantId: account.org.tenantId })).scopes).toEqual(['organization:write']);

    const write = await call(updateOrganization, {
      path: { tenantId: account.org.tenantId, id: account.org.id },
      body: { name: 'Renamed' },
      headers: bearer(jwt),
    });
    expect(write.response.status).toBe(200);
  });
});
