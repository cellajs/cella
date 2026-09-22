import { TTLCache } from '#/lib/ttl-cache';
import type { ApiKeyModel } from '#/modules/service-accounts/api-keys-db';
import type { ServiceAccountModel } from '#/modules/service-accounts/service-accounts-db';

/** A key and its account as the guard resolves them together; keyed by the key hash. */
export interface ApiKeyCacheEntry {
  apiKey: ApiKeyModel;
  account: ServiceAccountModel;
}

const apiKeyCache = new TTLCache<ApiKeyCacheEntry>({
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

export const getApiKeyCache = (hash: string): ApiKeyCacheEntry | undefined => apiKeyCache.get(hash);

export const setApiKeyCache = (hash: string, entry: ApiKeyCacheEntry): void => {
  apiKeyCache.set(hash, entry);
  let hashes = accountIndex.get(entry.account.id);
  if (!hashes) {
    hashes = new Set();
    accountIndex.set(entry.account.id, hashes);
  }
  hashes.add(hash);
};

/** After a revoke, roll, or account status change: every cached key of the account is dropped. */
export const invalidateApiKeyCacheByAccount = (accountId: string): void => {
  for (const hash of accountIndex.get(accountId) ?? []) apiKeyCache.delete(hash);
  accountIndex.delete(accountId);
};

/** True once per window per key; the caller stamps `lastUsedAt` when it gets true. */
export const shouldStampLastUsed = (keyId: string): boolean => {
  if (lastUsedCache.get(keyId)) return false;
  lastUsedCache.set(keyId, true);
  return true;
};

export const clearApiKeyCache = (): void => {
  apiKeyCache.clear();
  accountIndex.clear();
  lastUsedCache.clear();
};

export const apiKeyCacheStats = () => ({ apiKey: apiKeyCache.stats, lastUsed: lastUsedCache.stats });
