import { calculateJwkThumbprint, exportJWK, generateKeyPair, importJWK, type JWK } from 'jose';
import type { ConnectionModel } from '#/modules/connections/connections-db';
import { decryptData, encryptData } from '#/utils/data-encryption';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';
import { TimeSpan } from '#/utils/time-span';

const alg = 'RS256';

/** How old a connection's newest key grows before a rotation publishes the next key beside it. */
export const keyRotationPeriod = new TimeSpan(90, 'd');

/**
 * How long a next key is published before it signs, and how long the key it replaces stays published once it signs:
 * far beyond the five minutes the key set lets a platform keep it, and the import that signs with the key it read at
 * its start.
 */
export const keyOverlap = new TimeSpan(7, 'd');

/** A purpose per connection: a private key copied onto another row fails to decrypt there, and that row holds no key. */
const encryptionPurpose = (connectionId: string) => `lti-connection-key:${connectionId}`;

/** One key of a connection: its private JWK with `kid`, `alg` and `use`, and the moment it was minted and published. */
interface ConnectionKey {
  jwk: JWK;
  mintedAt: string;
}

type KeyHolder = Pick<ConnectionModel, 'id' | 'privateJwk' | 'createdAt'>;

const newKey = async (): Promise<ConnectionKey> => {
  const { privateKey } = await generateKeyPair(alg, { extractable: true });
  const jwk = await exportJWK(privateKey);
  return { jwk: { ...jwk, kid: await calculateJwkThumbprint(jwk), alg, use: 'sig' }, mintedAt: getIsoDate() };
};

const encryptKeys = (connectionId: string, keys: ConnectionKey[]) => encryptData(JSON.stringify(keys), encryptionPurpose(connectionId));

/**
 * A new RS256 key pair for the LTI connection `connectionId`, encrypted as `connections.privateJwk` holds its keys.
 * Each connection signs with its own key: a platform verifies the app's client assertions against the key set of that
 * registration alone.
 */
export const mintConnectionKey = async (connectionId: string) => encryptKeys(connectionId, [await newKey()]);

/**
 * The keys a connection holds, oldest first: one, and two during a rotation. Empty for none, or for keys that do not
 * decrypt for its row, which is logged as an error once per read: a changed encryption key in the configuration also
 * causes it. The single JWK a connection minted before keys rotated reads as one key minted with its row.
 */
const keysOf = ({ id, privateJwk, createdAt }: KeyHolder): ConnectionKey[] => {
  if (!privateJwk) return [];
  try {
    const held = JSON.parse(decryptData(privateJwk, encryptionPurpose(id)));
    return Array.isArray(held) ? held : [{ jwk: held, mintedAt: createdAt }];
  } catch (err) {
    log.error('LTI connection key does not decrypt', { connectionId: id, err });
    return [];
  }
};

const ageMs = ({ mintedAt }: ConnectionKey) => Date.now() - Date.parse(mintedAt);

/** The public halves of a connection's keys, as its key set serves them; empty for a connection without keys that decrypt. */
export const connectionPublicJwks = (connection: KeyHolder) =>
  keysOf(connection).flatMap(({ jwk: { kty, n, e, kid } }) =>
    kty === 'RSA' && n && e && kid ? [{ kty: 'RSA' as const, n, e, kid, alg: 'RS256' as const, use: 'sig' as const }] : [],
  );

/**
 * The key that signs now, ready to sign RS256, with its `kid`: the newest once it was published for `keyOverlap`,
 * else the oldest, which is a new connection's only key. Null for a connection without keys that decrypt.
 */
export const connectionSigningKey = async (connection: KeyHolder) => {
  const keys = keysOf(connection);
  const newest = keys.at(-1);
  const jwk = (newest && ageMs(newest) < keyOverlap.milliseconds() ? keys[0] : newest)?.jwk;
  return jwk?.kid ? { kid: jwk.kid, key: await importJWK(jwk, alg) } : null;
};

/**
 * A connection's keys one rotation step on, encrypted for its row. The key the newest replaced goes once the newest
 * signed for `keyOverlap`, and a lone key older than `keyRotationPeriod` gets a next key beside it.
 * @returns Null when no step is due, and for a connection without keys that decrypt.
 */
export const rotatedConnectionKeys = async (connection: KeyHolder) => {
  const keys = keysOf(connection);
  const newest = keys.at(-1);
  if (!newest) return null;
  const kept = keys.length > 1 && ageMs(newest) >= 2 * keyOverlap.milliseconds() ? [newest] : keys;
  const rotated = kept.length === 1 && ageMs(newest) >= keyRotationPeriod.milliseconds() ? [...kept, await newKey()] : kept;
  return rotated === keys ? null : encryptKeys(connection.id, rotated);
};
