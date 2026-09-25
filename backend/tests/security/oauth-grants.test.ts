import { nanoid } from 'nanoid';
import { createServiceAccount } from 'sdk';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { oauthClientsTable } from '#/modules/oauth-server/oauth-clients-db';
import { resourceUri } from '#/modules/oauth-server/resources';
import { hashToken } from '#/utils/hash-token';
import { defaultHeaders } from '../fixtures';
import { createTestOrganization } from '../helpers';
import {
  clientCredentialsToken,
  serveClientMetadataDocuments,
  startTestOauthServer,
  type TestOauthServer,
} from '../oauth-helpers';
import { createAppClient } from '../test-client';
import { clearSecurityTestData, createOrgUser } from './helpers';

const REDIRECT_URI = 'http://localhost:9999/callback';
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
