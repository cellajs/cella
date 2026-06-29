import { TTLCache } from '#/lib/ttl-cache';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import type { UserWithCounters } from '#/modules/user/helpers/select';

export interface SessionCacheEntry {
  user: UserWithCounters;
  isSystemAdmin: boolean;
}

export type MembershipCacheEntry = (MembershipBaseModel & { createdBy: string | null })[];

const sessionCache = new TTLCache<SessionCacheEntry>({
  maxSize: 5000,
  defaultTtl: 60_000, // 1 min — security-sensitive, kept short
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
  defaultTtl: 5 * 60_000, // 5 min — actively invalidated on changes
});

/** Reverse index: userId → Set of sessionIds for user-wide invalidation */
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

  // Register in reverse index
  let sessionIds = userIndex.get(userId);
  if (!sessionIds) {
    sessionIds = new Set();
    userIndex.set(userId, sessionIds);
  }
  sessionIds.add(sessionId);
};

export const setMembershipCache = (userId: string, memberships: MembershipCacheEntry): void => {
  membershipCache.set(userId, memberships);
};

/** Invalidate all cached entries for a user (across all their sessions) */
export const invalidateAuthCacheByUser = (userId: string): void => {
  // Invalidate all session entries
  const sessionIds = userIndex.get(userId);
  if (sessionIds) {
    for (const sessionId of sessionIds) {
      sessionCache.delete(sessionId);
    }
    userIndex.delete(userId);
  }
  // Invalidate membership entry
  membershipCache.delete(userId);
};

export const clearAuthCache = (): void => {
  sessionCache.clear();
  membershipCache.clear();
  userIndex.clear();
};

export const authCacheStats = () => ({
  session: sessionCache.stats,
  membership: membershipCache.stats,
});
