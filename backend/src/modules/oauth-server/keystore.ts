import { and, eq, lt, sql } from 'drizzle-orm';
import { calculateJwkThumbprint, createLocalJWKSet, errors, exportJWK, generateKeyPair, importJWK, type JWK, type JWTVerifyGetKey } from 'jose';
import { baseDb, type DbOrTx } from '#/db/db';
import { type SigningKeyModel, signingKeysTable } from '#/modules/oauth-server/signing-keys-db';
import { decryptData, encryptData } from '#/utils/data-encryption';
import { isoDateAgo } from '#/utils/iso-date';
import { log } from '#/utils/logger';
import { TimeSpan } from '#/utils/time-span';

const alg = 'RS256';
const encryptionPurpose = 'signing-key';
/** How long a process verifies with the public keys it read before it reads them again. */
const verifyCacheMs = 5 * 60 * 1000;
/** How long a key is published before it signs and after it stops: far beyond the verify cache and the one-hour token life. */
const rotationPeriod = new TimeSpan(30, 'd');

let verifyCache: { at: number; keySet: ReturnType<typeof createLocalJWKSet> } | null = null;

async function mintKey(db: DbOrTx, status: 'current' | 'next'): Promise<void> {
  const { privateKey, publicKey } = await generateKeyPair(alg, { extractable: true });
  const publicJwk = { ...(await exportJWK(publicKey)), alg, use: 'sig' };
  const kid = await calculateJwkThumbprint(publicJwk);
  const privateJwk = { ...(await exportJWK(privateKey)), kid, alg, use: 'sig' };
  // Two processes booting at once both try; the unique index lets one win and the other keeps that key.
  const inserted = await db
    .insert(signingKeysTable)
    .values({
      id: kid,
      alg,
      status,
      privateJwk: encryptData(JSON.stringify(privateJwk), encryptionPurpose),
      publicJwk: { ...publicJwk, kid },
    })
    .onConflictDoNothing()
    .returning({ id: signingKeysTable.id });
  if (inserted.length > 0) log.info('Signing key minted', { kid, status });
}

/** Guarantees a `current` and a `next` key exist; the next key is public before it ever signs (LTI §6.4, Canvas's rule). */
export async function ensureSigningKeys(): Promise<void> {
  const rows = await baseDb.select({ status: signingKeysTable.status }).from(signingKeysTable);
  const have = new Set(rows.map((row) => row.status));
  if (!have.has('current')) await mintKey(baseDb, 'current');
  if (!have.has('next')) await mintKey(baseDb, 'next');
}

async function rotationDue(db: DbOrTx): Promise<boolean> {
  const [next] = await db
    .select({ id: signingKeysTable.id })
    .from(signingKeysTable)
    .where(and(eq(signingKeysTable.status, 'next'), lt(signingKeysTable.createdAt, isoDateAgo(rotationPeriod))));
  return next !== undefined;
}

/**
 * Once `next` is older than the rotation period: drops `previous`, retires `current` to `previous`, promotes `next`
 * and mints a new `next`. Processes that try at once take turns, and each checks again under the lock.
 * @returns Whether this call rotated.
 */
export async function rotateSigningKeys(): Promise<boolean> {
  if (!(await rotationDue(baseDb))) return false;
  const rotated = await baseDb.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('signing_key_rotation', 0))`);
    if (!(await rotationDue(tx))) return false;
    await tx.delete(signingKeysTable).where(eq(signingKeysTable.status, 'previous'));
    await tx.update(signingKeysTable).set({ status: 'previous' }).where(eq(signingKeysTable.status, 'current'));
    await tx.update(signingKeysTable).set({ status: 'current' }).where(eq(signingKeysTable.status, 'next'));
    await mintKey(tx, 'next');
    return true;
  });
  if (rotated) verifyCache = null;
  return rotated;
}

/** Private JWKs the authorization server signs with: current first (it signs), then next and previous (published only). */
export async function loadSigningJwks(): Promise<{ keys: JWK[] }> {
  const rows = await baseDb.select().from(signingKeysTable);
  const order: Record<SigningKeyModel['status'], number> = { current: 0, next: 1, previous: 2 };
  const keys = rows.sort((a, b) => order[a.status] - order[b.status]).map((row): JWK => JSON.parse(decryptData(row.privateJwk, encryptionPurpose)));
  return { keys };
}

/**
 * The key that signs now, ready to sign RS256 with, and its `kid`.
 * @throws Error when the keystore holds no current key, which the OAuth worker's boot guarantees.
 */
export async function currentSigningKey() {
  const [current] = (await loadSigningJwks()).keys;
  if (!current?.kid) throw new Error('currentSigningKey: the keystore holds no current signing key');
  return { kid: current.kid, key: await importJWK(current, alg) };
}

/** The `kid` of the key that signs, undefined while the keystore holds none. */
export async function currentSigningKeyId(): Promise<string | undefined> {
  const [key] = await baseDb.select({ id: signingKeysTable.id }).from(signingKeysTable).where(eq(signingKeysTable.status, 'current')).limit(1);
  return key?.id;
}

async function readPublicJwkSet(): Promise<ReturnType<typeof createLocalJWKSet>> {
  const rows = await baseDb.select({ publicJwk: signingKeysTable.publicJwk }).from(signingKeysTable);
  const keySet = createLocalJWKSet({ keys: rows.map((row) => row.publicJwk) });
  verifyCache = { at: Date.now(), keySet };
  return keySet;
}

/**
 * Public keys of every key in the keystore, for in-process verification. A `kid` the cached set lacks reads the
 * keystore again: a key minted since the last read, such as the replacement of a deleted signer, verifies at once.
 */
export async function getPublicJwkSet(): Promise<JWTVerifyGetKey> {
  const cached = verifyCache && Date.now() - verifyCache.at < verifyCacheMs ? verifyCache.keySet : null;
  const keySet = cached ?? (await readPublicJwkSet());
  return async (header, token) => {
    try {
      return await keySet(header, token);
    } catch (error) {
      if (!cached || !(error instanceof errors.JWKSNoMatchingKey)) throw error;
      return (await readPublicJwkSet())(header, token);
    }
  };
}
