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
  defaultTtl: 60_000, // 1 min: keys are used and revoked in the API process, which drops them at the revoke or disable
  onSet: (hash, entry) => {
    const hashes = accountIndex.get(entry.account.id) ?? new Set<string>();
    hashes.add(hash);
    accountIndex.set(entry.account.id, hashes);
  },
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

/**
 * The cached key and account for a key hash, or else what `read` resolves, cached for the key's next uses.
 * @param hash - The hash of the API key.
 * @param read - Reads the key with its account by that hash; undefined when no such key exists.
 * @returns The key and its account, or undefined for an unknown key, which is never cached.
 */
export const loadApiKeyCache = (hash: string, read: () => Promise<ApiKeyCacheEntry | undefined>): Promise<ApiKeyCacheEntry | undefined> =>
  apiKeyCache.load(hash, read);

/** After a revoke, roll, or account status change: every cached key of the account is dropped. */
export const invalidateApiKeyCacheByAccount = (accountId: string): void => {
  for (const hash of accountIndex.get(accountId) ?? []) apiKeyCache.delete(hash);
  accountIndex.delete(accountId);
  apiKeyCache.discardPendingLoads();
};
