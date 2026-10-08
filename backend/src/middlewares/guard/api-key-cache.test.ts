import { describe, expect, it, vi } from 'vitest';
import { type ApiKeyCacheEntry, invalidateApiKeyCacheByAccount, loadApiKeyCache } from './api-key-cache';

/** A key of an account as the guard caches them; the cache reads the account id alone. */
const keyOf = (accountId: string, revokedAt: string | null = null) => ({ apiKey: { revokedAt }, account: { id: accountId } }) as ApiKeyCacheEntry;

describe('api key cache', () => {
  it('drops every cached key of an account, so its next use reads again', async () => {
    const read = vi.fn(async () => keyOf('account-1'));
    await loadApiKeyCache('hash-1', read);
    await loadApiKeyCache('hash-2', read);
    await loadApiKeyCache('hash-1', read);
    expect(read).toHaveBeenCalledTimes(2);

    invalidateApiKeyCacheByAccount('account-1');

    await loadApiKeyCache('hash-1', read);
    await loadApiKeyCache('hash-2', read);
    expect(read).toHaveBeenCalledTimes(4);
  });

  it('must not cache a key read before its revocation via a read still in flight at the drop', async () => {
    let answer: (entry: ApiKeyCacheEntry) => void = () => {};
    const pending = loadApiKeyCache('hash-3', () => new Promise<ApiKeyCacheEntry>((resolve) => (answer = resolve)));

    // No key of the account is cached yet, so the drop finds no entry.
    invalidateApiKeyCacheByAccount('account-2');
    answer(keyOf('account-2'));
    expect((await pending)?.apiKey.revokedAt).toBeNull();

    const revoked = await loadApiKeyCache('hash-3', async () => keyOf('account-2', '2026-01-01T00:00:00.000Z'));
    expect(revoked?.apiKey.revokedAt).not.toBeNull();
  });

  it('caches no unknown key', async () => {
    const read = vi.fn(async () => undefined);

    expect(await loadApiKeyCache('hash-4', read)).toBeUndefined();
    expect(await loadApiKeyCache('hash-4', read)).toBeUndefined();
    expect(read).toHaveBeenCalledTimes(2);
  });
});
