import { TTLCache } from '#/lib/ttl-cache';
import type { CredentialModel } from '#/modules/service-accounts/credentials-db';
import type { ServiceAccountModel } from '#/modules/service-accounts/service-accounts-db';

/** A key and its account as the guard resolves them together; keyed by the key hash. */
export interface CredentialCacheEntry {
  credential: CredentialModel;
  account: ServiceAccountModel;
}

const credentialCache = new TTLCache<CredentialCacheEntry>({
  maxSize: 5000,
  defaultTtl: 60_000, // 1 min, security-sensitive: a revoke or disable is also invalidated explicitly
  onDispose: (hash, entry) => {
    const hashes = accountIndex.get(entry.account.id);
    if (hashes) {
      hashes.delete(hash);
      if (hashes.size === 0) accountIndex.delete(entry.account.id);
    }
  },
});

/** Reverse index: account id to the key hashes cached for it, so a revoke or disable can drop them all. */
const accountIndex = new Map<string, Set<string>>();

/** `lastUsedAt` is written at most once per key per window; a miss means "write now". */
const lastUsedCache = new TTLCache<true>({ maxSize: 5000, defaultTtl: 5 * 60_000 });

export const getCredentialCache = (hash: string): CredentialCacheEntry | undefined => credentialCache.get(hash);

export const setCredentialCache = (hash: string, entry: CredentialCacheEntry): void => {
  credentialCache.set(hash, entry);
  let hashes = accountIndex.get(entry.account.id);
  if (!hashes) {
    hashes = new Set();
    accountIndex.set(entry.account.id, hashes);
  }
  hashes.add(hash);
};

/** After a revoke, roll, or account status change: every cached key of the account is dropped. */
export const invalidateCredentialCacheByAccount = (accountId: string): void => {
  for (const hash of accountIndex.get(accountId) ?? []) credentialCache.delete(hash);
  accountIndex.delete(accountId);
};

/** True once per window per key; the caller stamps `lastUsedAt` when it gets true. */
export const shouldStampLastUsed = (credentialId: string): boolean => {
  if (lastUsedCache.get(credentialId)) return false;
  lastUsedCache.set(credentialId, true);
  return true;
};

export const clearCredentialCache = (): void => {
  credentialCache.clear();
  accountIndex.clear();
  lastUsedCache.clear();
};

export const credentialCacheStats = () => ({ credential: credentialCache.stats, lastUsed: lastUsedCache.stats });
