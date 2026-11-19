import { calculateJwkThumbprint, exportJWK, generateKeyPair, importJWK, type JWK } from 'jose';
import type { ConnectionModel } from '#/modules/connections/connections-db';
import { decryptData, encryptData } from '#/utils/data-encryption';
import { log } from '#/utils/logger';

const alg = 'RS256';

/** A purpose per connection: a private key copied onto another row fails to decrypt there, and that row holds no key. */
const encryptionPurpose = (connectionId: string) => `lti-connection-key:${connectionId}`;

/**
 * A new RS256 key pair for the LTI connection `connectionId`: its private JWK with `kid`, `alg` and `use`, encrypted as
 * `connections.privateJwk` holds it. Each connection signs with its own key: a platform verifies the app's client
 * assertions against the key set of that registration alone.
 */
export const mintConnectionKey = async (connectionId: string) => {
  const { privateKey } = await generateKeyPair(alg, { extractable: true });
  const jwk = await exportJWK(privateKey);
  const kid = await calculateJwkThumbprint(jwk);
  return encryptData(JSON.stringify({ ...jwk, kid, alg, use: 'sig' }), encryptionPurpose(connectionId));
};

type KeyHolder = Pick<ConnectionModel, 'id' | 'privateJwk'>;

/**
 * The private JWK a connection holds; null for none, or one that does not decrypt for its row. A key that does not
 * decrypt is logged as an error, once per read: a changed encryption key in the configuration also causes it.
 */
const privateJwkOf = ({ id, privateJwk }: KeyHolder): JWK | null => {
  if (!privateJwk) return null;
  try {
    return JSON.parse(decryptData(privateJwk, encryptionPurpose(id)));
  } catch (err) {
    log.error('LTI connection key does not decrypt', { connectionId: id, err });
    return null;
  }
};

/** The public half of a connection's key, as its key set serves it; null for a connection without a key that decrypts. */
export const connectionPublicJwk = (connection: KeyHolder) => {
  const jwk = privateJwkOf(connection);
  if (jwk?.kty !== 'RSA' || !jwk.n || !jwk.e || !jwk.kid) return null;
  return { kty: 'RSA' as const, n: jwk.n, e: jwk.e, kid: jwk.kid, alg: 'RS256' as const, use: 'sig' as const };
};

/** A connection's key, ready to sign RS256, with its `kid`; null for a connection without a key that decrypts. */
export const connectionSigningKey = async (connection: KeyHolder) => {
  const jwk = privateJwkOf(connection);
  return jwk?.kid ? { kid: jwk.kid, key: await importJWK(jwk, alg) } : null;
};
