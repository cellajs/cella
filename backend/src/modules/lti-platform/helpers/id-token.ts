import { type JWTPayload, SignJWT } from 'jose';
import { currentSigningKey } from '#/modules/oauth-server/keystore';

/** How long an LTI tool may take to receive a launch's ID token. */
const idTokenLifetimeSeconds = 5 * 60;

/**
 * Signs a launch's ID token with the keystore's current key, RS256 with its `kid`: the key set the issuer publishes
 * verifies it. Sets `iat` and `exp`.
 * @throws What `currentSigningKey` throws.
 */
export async function signLtiIdToken(claims: JWTPayload): Promise<string> {
  const { kid, key } = await currentSigningKey();
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid, typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime(`${idTokenLifetimeSeconds}s`)
    .sign(key);
}
