import { inArray } from 'drizzle-orm';
import { calculateJwkThumbprint, createLocalJWKSet, exportJWK, generateKeyPair, type JWK } from 'jose';
import type { DbOrTx } from '#/db/db';
import { baseDb } from '#/db/db';
import { signingKeysTable } from '#/modules/oauth-server/signing-keys-db';
import { decryptData, encryptData } from '#/utils/data-encryption';
import { log } from '#/utils/logger';

const ALG = 'RS256';
const ENCRYPTION_PURPOSE = 'signing-key';
const VERIFY_CACHE_MS = 5 * 60 * 1000;

async function mintKey(db: DbOrTx, status: 'current' | 'next'): Promise<void> {
  const { privateKey, publicKey } = await generateKeyPair(ALG, { extractable: true });
  const publicJwk = { ...(await exportJWK(publicKey)), alg: ALG, use: 'sig' };
  const kid = await calculateJwkThumbprint(publicJwk);
  const privateJwk = { ...(await exportJWK(privateKey)), kid, alg: ALG, use: 'sig' };
  // Two processes booting at once both try; the unique index lets one win and the other keeps that key.
  const inserted = await db
    .insert(signingKeysTable)
    .values({
      id: kid,
      alg: ALG,
      status,
      privateJwk: encryptData(JSON.stringify(privateJwk), ENCRYPTION_PURPOSE),
      publicJwk: { ...publicJwk, kid },
    })
    .onConflictDoNothing()
    .returning({ id: signingKeysTable.id });
  if (inserted.length > 0) log.info('Signing key minted', { kid, status });
}

/** Guarantees a `current` and a `next` key exist; the next key is public before it ever signs (LTI §6.4, Canvas's rule). */
export async function ensureSigningKeys(db: DbOrTx = baseDb): Promise<void> {
  const rows = await db
    .select({ status: signingKeysTable.status })
    .from(signingKeysTable)
    .where(inArray(signingKeysTable.status, ['current', 'next']));
  const have = new Set(rows.map((row) => row.status));
  if (!have.has('current')) await mintKey(db, 'current');
  if (!have.has('next')) await mintKey(db, 'next');
}

/** Private JWKs the authorization server signs with: current first (it signs), next second (published only). */
export async function loadSigningJwks(db: DbOrTx = baseDb): Promise<{ keys: JWK[] }> {
  const rows = await db
    .select()
    .from(signingKeysTable)
    .where(inArray(signingKeysTable.status, ['current', 'next']));
  const order = { current: 0, next: 1 } as const;
  const keys = rows
    .sort((a, b) => order[a.status as keyof typeof order] - order[b.status as keyof typeof order])
    .map((row) => JSON.parse(decryptData(row.privateJwk, ENCRYPTION_PURPOSE)) as JWK);
  return { keys };
}

// Rotation (next → current → retired) is not wired yet: the provider loads its signing keys at boot, so a rotation
// route must also restart or reload the authorization server. The plan tracks it; nothing here rotates.

let verifyCache: { at: number; keySet: ReturnType<typeof createLocalJWKSet> } | null = null;

/** Public keys of every status (retired ones keep verifying), as a local JWKS for in-process verification. */
export async function getVerificationKeySet(): Promise<ReturnType<typeof createLocalJWKSet>> {
  if (verifyCache && Date.now() - verifyCache.at < VERIFY_CACHE_MS) return verifyCache.keySet;
  const rows = await baseDb.select({ publicJwk: signingKeysTable.publicJwk }).from(signingKeysTable);
  const keySet = createLocalJWKSet({ keys: rows.map((row) => row.publicJwk as JWK) });
  verifyCache = { at: Date.now(), keySet };
  return keySet;
}
