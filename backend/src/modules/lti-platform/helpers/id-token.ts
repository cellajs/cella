import { importJWK, type JWTPayload, SignJWT } from 'jose';
import { loadSigningJwks } from '#/modules/oauth-server/keystore';

/** How long an LTI tool may take to receive a launch's ID token. */
const idTokenLifetimeSeconds = 5 * 60;

/**
 * Signs a launch's ID token with the keystore's current key, RS256 with its `kid`: the key set the issuer publishes
 * verifies it. Sets `iat` and `exp`.
 * @throws Error when the keystore holds no current key, which the worker's boot guarantees.
 */
export async function signLtiIdToken(claims: JWTPayload): Promise<string> {
  const [current] = (await loadSigningJwks()).keys;
  if (!current?.kid) throw new Error('signLtiIdToken: the keystore holds no current signing key');
  const key = await importJWK(current, 'RS256');
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: current.kid, typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime(`${idTokenLifetimeSeconds}s`)
    .sign(key);
}
