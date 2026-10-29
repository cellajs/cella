import { inArray } from 'drizzle-orm';
import { calculateJwkThumbprint, exportJWK, generateKeyPair, importJWK, SignJWT } from 'jose';
import { nanoid } from 'nanoid';
import { getAttachments } from 'sdk';
import { appConfig } from 'shared';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { ensureSigningKeys, loadSigningJwks } from '#/modules/oauth-server/keystore';
import { resourceUri } from '#/modules/oauth-server/resources';
import { signingKeysTable } from '#/modules/oauth-server/signing-keys-db';
import { isoDateAgo } from '#/utils/iso-date';
import { TimeSpan } from '#/utils/time-span';
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

/** A key pair minted as the keystore mints one, stored as `retired` since `retiredAt`; only its public half is in the row. */
async function retiredKey(retiredAt: string | null): Promise<SigningKey> {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const publicJwk = { ...(await exportJWK(publicKey)), alg: 'RS256', use: 'sig' };
  const kid = await calculateJwkThumbprint(publicJwk);
  await db.insert(signingKeysTable).values({ id: kid, status: 'retired', retiredAt, privateJwk: 'leaked', publicJwk: { ...publicJwk, kid } });
  return { kid, privateKey };
}

/**
 * Whoever holds a private signing key mints any token they like, so retiring a key is what revokes its tokens: once the
 * last token it signed has expired, the verifier must no longer know the key.
 */
describe('signing key rotation', async () => {
  const call = await createAppClient();
  let current: SigningKey;
  let retiredLongAgo: SigningKey;
  let retiredRecently: SigningKey;
  let retiredUndated: SigningKey;

  // The verifier caches the key set per process, so the retired rows must exist before this file's first request.
  beforeAll(async () => {
    await ensureSigningKeys();
    const [currentJwk] = (await loadSigningJwks()).keys;
    current = { kid: currentJwk.kid ?? '', privateKey: await importJWK(currentJwk, 'RS256') };
    retiredLongAgo = await retiredKey(isoDateAgo(new TimeSpan(2, 'h')));
    retiredRecently = await retiredKey(isoDateAgo(new TimeSpan(10, 'm')));
    retiredUndated = await retiredKey(null);
  });

  afterEach(async () => await clearSecurityTestData());

  afterAll(async () => {
    const retired = [retiredLongAgo, retiredRecently, retiredUndated].map(({ kid }) => kid);
    await db.delete(signingKeysTable).where(inArray(signingKeysTable.id, retired));
  });

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
    const read = await call(getAttachments, { path: { tenantId: org.tenantId, organizationId: org.id }, headers: bearerHeaders(jwt) });
    return { status: read.response.status, error: read.error };
  }

  it.each([
    ['a key retired two hours ago', () => retiredLongAgo],
    ['a retired key with no retirement time', () => retiredUndated],
  ])('must not act via a token signed by %s', async (_vector, key) => {
    expect(await forgedServiceToken(key())).toMatchObject({ status: 401, error: { meta: { reason: 'invalid_token' } } });
  });

  it('still verifies a token signed by the current key or a key retired within its grace window (positive control)', async () => {
    expect(await forgedServiceToken(current)).toMatchObject({ status: 200 });
    expect(await forgedServiceToken(retiredRecently)).toMatchObject({ status: 200 });
  });
});
