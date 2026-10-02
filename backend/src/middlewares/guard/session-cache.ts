import { TTLCache } from '#/lib/ttl-cache';
import type { ResolvedSession } from '#/modules/auth/sessions/operations/resolve-session';

/**
 * Sessions by the hash of their token, for 10 seconds, so a page's burst of requests reads its session once. An entry
 * carries the user's system role and bindings version, so a process drops a user's entries as soon as it learns of a
 * change: the writer through `invalidateCache.user` and `revokeSessions`, the API process through CDC
 * (`modules/auth/sessions/session-listeners.ts`). Any other process sees the change within the 10 seconds.
 */
const sessionCache = new TTLCache<ResolvedSession>({
  maxSize: 5000,
  defaultTtl: 10_000,
  onDispose: (secretHash, entry) => {
    const hashes = userIndex.get(entry.user.id);
    hashes?.delete(secretHash);
    if (hashes?.size === 0) userIndex.delete(entry.user.id);
  },
});

/** The token hashes cached per user, so a change to the user drops all of them. */
const userIndex = new Map<string, Set<string>>();

export const getCachedSession = (secretHash: string): ResolvedSession | undefined => sessionCache.get(secretHash);

export const setCachedSession = (secretHash: string, entry: ResolvedSession): void => {
  sessionCache.set(secretHash, entry);
  const hashes = userIndex.get(entry.user.id) ?? new Set<string>();
  hashes.add(secretHash);
  userIndex.set(entry.user.id, hashes);
};

/** After a change to the user's sessions, row, memberships or system role. */
export const dropCachedSessions = (userId: string): void => {
  for (const secretHash of userIndex.get(userId) ?? []) sessionCache.delete(secretHash);
  userIndex.delete(userId);
};

/** Drops every entry: what a test does to stand in for the TTL passing. */
export const clearSessionCache = (): void => {
  sessionCache.clear();
  userIndex.clear();
};
