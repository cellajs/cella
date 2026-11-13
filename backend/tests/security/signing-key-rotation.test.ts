import { calculateJwkThumbprint, exportJWK, generateKeyPair, importJWK, SignJWT } from 'jose';
import { nanoid } from 'nanoid';
import { listAttachments } from 'sdk';
import { appConfig } from 'shared';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ensureSigningKeys, loadSigningJwks } from '#/modules/oauth-server/keystore';
import { resourceUri } from '#/modules/oauth-server/resources';
import { adminRole } from '../fixtures';
import { createTestOrganization } from '../helpers';
import { bearerHeaders, serviceAccountWithKey } from '../oauth-helpers';
import { createAppClient } from '../test-client';
import { clearSecurityTestData, createFactorOrgUser } from './helpers';

/** A private signing key that leaked, under the `kid` its row in `signing_keys` publishes. */
interface SigningKey {
  kid: string;
  privateKey: CryptoKey | Uint8Array;
}

/** A key pair minted as the keystore mints one, whose row is gone: a key taken out of the keystore. */
async function removedKey(): Promise<SigningKey> {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const kid = await calculateJwkThumbprint({ ...(await exportJWK(publicKey)), alg: 'RS256', use: 'sig' });
  return { kid, privateKey };
}

/**
 * Whoever holds a private signing key mints any token they like, so taking a key out of the keystore is what revokes
 * its tokens: the verifier knows only the `current` and `next` keys.
 */
describe('signing key rotation', async () => {
  const call = await createAppClient();
  let current: SigningKey;

  beforeAll(async () => {
    await ensureSigningKeys();
    const [currentJwk] = (await loadSigningJwks()).keys;
    current = { kid: currentJwk.kid ?? '', privateKey: await importJWK(currentJwk, 'RS256') };
  });

  afterEach(async () => await clearSecurityTestData());

  /**
   * A well-formed service token for a live API key, as the authorization server mints one for `client_credentials`,
   * signed with `key`: what the holder of a leaked key forges.
   */
  async function forgedServiceToken(key: SigningKey) {
    const org = await createTestOrganization();
    const admin = await createFactorOrgUser(call, org.tenantId, org.id, `admin-${nanoid(8)}`, adminRole);
    const { clientId: accountId, keyId } = await serviceAccountWithKey(org, admin.sessionCookie);
    const jwt = await new SignJWT({ tenant_id: org.tenantId, client_id: accountId, actor_kind: 'service', key_id: keyId, scope: 'attachment:read' })
      .setProtectedHeader({ alg: 'RS256', kid: key.kid, typ: 'at+jwt' })
      .setSubject(accountId)
      .setIssuer(appConfig.oauthUrl)
      .setAudience(resourceUri({ face: 'api', tenantId: org.tenantId }))
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(key.privateKey);
    const read = await call(listAttachments, { path: { tenantId: org.tenantId, organizationId: org.id }, headers: bearerHeaders(jwt) });
    return { status: read.response.status, error: read.error };
  }

  it('must not act via a token signed by a key the keystore no longer holds', async () => {
    expect(await forgedServiceToken(await removedKey())).toMatchObject({ status: 401, error: { reason: 'invalid_token' } });
  });

  it('still verifies a token signed by the current key (positive control)', async () => {
    expect(await forgedServiceToken(current)).toMatchObject({ status: 200 });
  });
});
