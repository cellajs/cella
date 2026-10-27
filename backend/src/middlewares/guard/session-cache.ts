import { TTLCache } from '#/lib/ttl-cache';
import type { ResolvedSession } from '#/modules/auth/sessions/operations/resolve-session';

/**
 * Sessions by the hash of their token, for 10 seconds, so a page's burst of requests reads its session once: requests
 * that find no entry share one read. An entry carries the user's system role and bindings version, so a process drops
 * a user's entries as soon as it learns of a change: the writer through `invalidateCache.user` and `revokeSessions`,
 * the API process through CDC (`modules/auth/sessions/session-listeners.ts`). A read that started before a drop stores
 * nothing. Any other process sees the change within the 10 seconds.
 */
const sessionCache = new TTLCache<ResolvedSession>({ maxSize: 5000, defaultTtl: 10_000 });

/**
 * The cached session for a token hash, or else the one `read` resolves, cached for the next requests.
 * @param secretHash - The hash of the session token.
 * @param read - Reads the live session by that hash; rejects with the refusal for one that is not live.
 * @returns The session; a refusal rejects and is never cached.
 */
export const loadCachedSession = (secretHash: string, read: () => Promise<ResolvedSession>): Promise<ResolvedSession> =>
  sessionCache.load(secretHash, read);

/** After a change to the user's sessions, row, memberships or system role. */
export const dropCachedSessions = (userId: string): void => {
  // Also discards every session read in flight, whose user is not known yet: it must not store what it read before the change.
  sessionCache.invalidateWhere((entry) => entry.user.id === userId);
};

/** Drops every entry: what a test does to stand in for the TTL passing. */
export const clearSessionCache = (): void => {
  sessionCache.clear();
};
