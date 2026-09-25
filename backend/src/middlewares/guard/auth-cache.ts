import { TTLCache } from '#/lib/ttl-cache';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import type { UserWithCounters } from '#/modules/user/helpers/select';
import type { UserModel } from '#/modules/user/user-db';

export interface SessionCacheEntry {
  user: UserWithCounters;
  /** Holds the admin system role. The rights also need an allowlisted request address, so they are never cached. */
  hasSystemRole: boolean;
}

export type MembershipCacheEntry = (MembershipBaseModel & { createdBy: string | null })[];

const sessionCache = new TTLCache<SessionCacheEntry>({
  maxSize: 5000,
  defaultTtl: 60_000, // 1 min, security-sensitive
  onDispose: (key, value) => {
    // Clean up reverse index when entry expires or is evicted
    const sessionIds = userIndex.get(value.user.id);
    if (sessionIds) {
      sessionIds.delete(key);
      if (sessionIds.size === 0) userIndex.delete(value.user.id);
    }
  },
});

const membershipCache = new TTLCache<MembershipCacheEntry>({
  maxSize: 5000,
  defaultTtl: 5 * 60_000, // 5 min, actively invalidated on changes
});

/** Users behind access tokens have no session to cache under; the row is cached by user id. */
const tokenUserCache = new TTLCache<UserModel>({ maxSize: 5000, defaultTtl: 60_000 });

/** Reverse index: userId to Set of sessionIds for user-wide invalidation. */
const userIndex = new Map<string, Set<string>>();

export const getSessionCache = (sessionId: string): SessionCacheEntry | undefined => {
  return sessionCache.get(sessionId);
};

export const getMembershipCache = (userId: string): MembershipCacheEntry | undefined => {
  return membershipCache.get(userId);
};

export const setSessionCache = (sessionId: string, userId: string, entry: SessionCacheEntry): void => {
  // Jitter TTL ±20% (48-72s) to prevent synchronized expiry under load
  const jitteredTtl = Math.round(60_000 * (0.8 + Math.random() * 0.4));
  sessionCache.set(sessionId, entry, jitteredTtl);

  let sessionIds = userIndex.get(userId);
  if (!sessionIds) {
    sessionIds = new Set();
    userIndex.set(userId, sessionIds);
  }
  sessionIds.add(sessionId);
};

export const setMembershipCache = (userId: string, memberships: MembershipCacheEntry): void => {
  // Jitter TTL ±20% (4-6 min) so a synchronized cohort cannot add a membership-DB burst to a fan-out stampede
  const jitteredTtl = Math.round(5 * 60_000 * (0.8 + Math.random() * 0.4));
  membershipCache.set(userId, memberships, jitteredTtl);
};

export const getTokenUserCache = (userId: string): UserModel | undefined => tokenUserCache.get(userId);

export const setTokenUserCache = (user: UserModel): void => tokenUserCache.set(user.id, user);

/** Invalidate all cached entries for a user: every session, the memberships and the user behind access tokens. */
export const invalidateAuthCacheByUser = (userId: string): void => {
  const sessionIds = userIndex.get(userId);
  if (sessionIds) {
    for (const sessionId of sessionIds) {
      sessionCache.delete(sessionId);
    }
    userIndex.delete(userId);
  }
  membershipCache.delete(userId);
  tokenUserCache.delete(userId);
};

export const clearAuthCache = (): void => {
  sessionCache.clear();
  membershipCache.clear();
  tokenUserCache.clear();
  userIndex.clear();
};

export const authCacheStats = () => ({
  session: sessionCache.stats,
  membership: membershipCache.stats,
});
