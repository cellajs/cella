import { TTLCache } from '#/lib/ttl-cache';
import type { AppClientMetadata } from '#/modules/oauth-server/adapter';

/**
 * The provider caches only static clients; adapter-loaded ones are cached here, dropped in every process when the
 * account changes. Its own module so the API can drop an entry without loading the provider.
 */
export const clientCache = new TTLCache<AppClientMetadata>({ maxSize: 1000, defaultTtl: 60_000 });

export const invalidateOauthClientCache = (id: string): void => {
  clientCache.delete(id);
};

/** Drops every client: a process whose invalidation channel reconnects may have missed messages. */
export const clearOauthClientCache = (): void => clientCache.clear();
