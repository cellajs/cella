import { baseDb as db } from '#/db/db';
import { userCountersTable } from '#/db/schema/user-counters';
import { getIsoDate } from '#/utils/iso-date';

const THROTTLE_MS = 5 * 60 * 1000; // 5 minutes

/** In-memory throttle: tracks last DB write timestamp per user */
const lastSeenMemory = new Map<string, number>();

/**
 * Update lastSeenAt if more than 5 minutes have passed.
 * Uses an in-memory timestamp check to avoid DB reads for throttle logic.
 * The DB write is fire-and-forget (not awaited) since it's non-critical.
 */
export const updateLastSeenAt = (userId: string): void => {
  const now = Date.now();
  const last = lastSeenMemory.get(userId) ?? 0;
  if (now - last < THROTTLE_MS) return;

  lastSeenMemory.set(userId, now);

  const timestamp = getIsoDate();
  db.insert(userCountersTable)
    .values({ userId, lastSeenAt: timestamp })
    .onConflictDoUpdate({
      target: userCountersTable.userId,
      set: { lastSeenAt: timestamp },
    })
    .catch(() => {
      // Reset memory on failure so next request retries
      lastSeenMemory.delete(userId);
    });
};
