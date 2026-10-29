import { gt, inArray, or } from 'drizzle-orm';
import { calculateJwkThumbprint, createLocalJWKSet, exportJWK, generateKeyPair, type JWK } from 'jose';
import { baseDb } from '#/db/db';
import { type SigningKeyModel, signingKeysTable } from '#/modules/oauth-server/signing-keys-db';
import { decryptData, encryptData } from '#/utils/data-encryption';
import { isoDateAgo } from '#/utils/iso-date';
import { log } from '#/utils/logger';
import { TimeSpan } from '#/utils/time-span';

const alg = 'RS256';
const encryptionPurpose = 'signing-key';
/** How long a process verifies with the public keys it read before it reads them again. */
const verifyCacheMs = 5 * 60 * 1000;
/** How long after `retiredAt` a retired key verifies: the access token lifetime (`provider.ts`), up to `verifyCacheMs` more where cached. */
const retiredKeyGrace = new TimeSpan(1, 'h');

async function mintKey(status: 'current' | 'next'): Promise<void> {
  const { privateKey, publicKey } = await generateKeyPair(alg, { extractable: true });
  const publicJwk = { ...(await exportJWK(publicKey)), alg, use: 'sig' };
  const kid = await calculateJwkThumbprint(publicJwk);
  const privateJwk = { ...(await exportJWK(privateKey)), kid, alg, use: 'sig' };
  // Two processes booting at once both try; the unique index lets one win and the other keeps that key.
  const inserted = await baseDb
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
  const rows = await baseDb
    .select({ status: signingKeysTable.status })
    .from(signingKeysTable)
    .where(inArray(signingKeysTable.status, ['current', 'next']));
  const have = new Set(rows.map((row) => row.status));
  if (!have.has('current')) await mintKey('current');
  if (!have.has('next')) await mintKey('next');
}

/** Private JWKs the authorization server signs with: current first (it signs), next second (published only). */
export async function loadSigningJwks(): Promise<{ keys: JWK[] }> {
  const rows = await baseDb
    .select()
    .from(signingKeysTable)
    .where(inArray(signingKeysTable.status, ['current', 'next']));
  const order: Record<SigningKeyModel['status'], number> = { current: 0, next: 1, retired: 2 };
  const keys = rows.sort((a, b) => order[a.status] - order[b.status]).map((row): JWK => JSON.parse(decryptData(row.privateJwk, encryptionPurpose)));
  return { keys };
}

// Nothing rotates keys (next → current → retired): the provider loads its signing keys at boot, so a rotation also
// restarts the authorization server.

let verifyCache: { at: number; keySet: ReturnType<typeof createLocalJWKSet> } | null = null;

/** Public keys of `current`, `next` and keys retired within their grace, as a local JWKS for in-process verification. */
export async function getPublicJwkSet(): Promise<ReturnType<typeof createLocalJWKSet>> {
  if (verifyCache && Date.now() - verifyCache.at < verifyCacheMs) return verifyCache.keySet;
  const rows = await baseDb
    .select({ publicJwk: signingKeysTable.publicJwk })
    .from(signingKeysTable)
    .where(or(inArray(signingKeysTable.status, ['current', 'next']), gt(signingKeysTable.retiredAt, isoDateAgo(retiredKeyGrace))));
  const keySet = createLocalJWKSet({ keys: rows.map((row) => row.publicJwk) });
  verifyCache = { at: Date.now(), keySet };
  return keySet;
}
