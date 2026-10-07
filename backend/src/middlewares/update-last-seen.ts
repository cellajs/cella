import { eq } from 'drizzle-orm';
import { baseDb as db } from '#/db/db';
import { actorsTable } from '#/modules/actors/actors-db';
import { getIsoDate } from '#/utils/iso-date';

const THROTTLE_MS = 5 * 60 * 1000; // 5 minutes

/** In-memory throttle: tracks last DB write timestamp per actor */
const lastSeenMemory = new Map<string, number>();

/** Writes lastSeenAt at most once per THROTTLE_MS, deciding from memory. The write is fire-and-forget. */
export const updateLastSeenAt = (actorId: string): void => {
  const now = Date.now();
  const last = lastSeenMemory.get(actorId) ?? 0;
  if (now - last < THROTTLE_MS) return;

  lastSeenMemory.set(actorId, now);

  db.update(actorsTable)
    .set({ lastSeenAt: getIsoDate() })
    .where(eq(actorsTable.id, actorId))
    .catch(() => {
      // Reset memory on failure so next request retries
      lastSeenMemory.delete(actorId);
    });
};
