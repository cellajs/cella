import { eq } from 'drizzle-orm';
import { baseDb as db } from '#/db/db';
import { TTLCache } from '#/lib/ttl-cache';
import { actorsTable } from '#/modules/actors/actors-db';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';

const THROTTLE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * When each actor was last stamped. An entry expires with its throttle window, so memory holds the recently active
 * actors alone; past capacity the oldest entry goes, and that actor is stamped again early.
 */
const lastStamped = new TTLCache<number>({ maxSize: 50_000, defaultTtl: THROTTLE_MS });

/**
 * Writes lastSeenAt at most once per THROTTLE_MS, deciding from memory. The write is fire-and-forget: a failed one is
 * logged and the actor waits out the window like any other, so a database fault adds no write per request.
 */
export const updateLastSeenAt = (actorId: string): void => {
  const now = Date.now();
  const last = lastStamped.get(actorId);
  if (last !== undefined && now - last < THROTTLE_MS) return;

  lastStamped.set(actorId, now);

  db.update(actorsTable)
    .set({ lastSeenAt: getIsoDate() })
    .where(eq(actorsTable.id, actorId))
    .catch((err) => log.warn('Last seen stamp failed', { actorId, err }));
};
