import { TTLCache } from '#/lib/ttl-cache';
import type { ApiKeyModel } from '#/modules/service-accounts/api-keys-db';
import type { ServiceAccountModel } from '#/modules/service-accounts/service-accounts-db';

/** A key and its account as the guard resolves them together; keyed by the key hash. */
export interface ApiKeyCacheEntry {
  apiKey: ApiKeyModel;
  account: ServiceAccountModel;
}

// A minute: keys are used and revoked in the API process, which drops them at the revoke or disable.
const apiKeyCache = new TTLCache<ApiKeyCacheEntry>({ maxSize: 5000, defaultTtl: 60_000 });

/**
 * The cached key and account for a key hash, or else what `read` resolves, cached for the key's next uses.
 * @param hash - The hash of the API key.
 * @param read - Reads the key with its account by that hash; undefined when no such key exists.
 * @returns The key and its account, or undefined for an unknown key, which is never cached.
 */
export const loadCachedApiKey = (hash: string, read: () => Promise<ApiKeyCacheEntry | undefined>): Promise<ApiKeyCacheEntry | undefined> =>
  apiKeyCache.load(hash, read);

/** After a revoke, roll, or account status change: every cached key of the account is dropped, and no read in flight stores one. */
export const dropCachedApiKeys = (accountId: string): void => {
  apiKeyCache.invalidateWhere((entry) => entry.account.id === accountId);
};
