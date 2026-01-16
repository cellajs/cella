import { db } from '#/db/db';
import { lastSeenTable } from '#/db/schema/last-seen';
import { getIsoDate } from '#/utils/iso-date';
import { TimeSpan } from '#/utils/time-span';

/**
 * Update lastSeenAt if more than 5 minutes have passed.
 * Returns true if updated, false if skipped.
 */
export const updateLastSeenAt = async (userId: string, currentLastSeenAt: string | null): Promise<boolean> => {
  const now = new Date();
  const shouldUpdate =
    !currentLastSeenAt || new Date(currentLastSeenAt).getTime() < now.getTime() - new TimeSpan(5, 'm').milliseconds();

  if (shouldUpdate) {
    const timestamp = getIsoDate();
    await db
      .insert(lastSeenTable)
      .values({ userId, lastSeenAt: timestamp })
      .onConflictDoUpdate({
        target: lastSeenTable.userId,
        set: { lastSeenAt: timestamp },
      });
    return true;
  }

  return false;
};
