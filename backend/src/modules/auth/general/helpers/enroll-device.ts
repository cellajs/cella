import { sql } from 'drizzle-orm';
import { baseDb as db } from '#/db/db';
import { devicesTable } from '#/modules/auth/devices-db';
import { hashDeviceIdForUser } from '#/utils/hash-pii';
import { getIsoDate } from '#/utils/iso-date';

/**
 * Records that the user signed in from this browser and tells whether it is the first time. One upsert decides it: `xmax = 0`
 * holds only for a freshly inserted row, so of several parallel sign-ins exactly one sees `isNew`.
 */
export const enrollDevice = async (userId: string, deviceId: string) => {
  const deviceIdHash = hashDeviceIdForUser(deviceId, userId);
  const now = getIsoDate();

  const [row] = await db
    .insert(devicesTable)
    .values({ userId, deviceIdHash, firstSeenAt: now, lastSeenAt: now })
    .onConflictDoUpdate({ target: [devicesTable.userId, devicesTable.deviceIdHash], set: { lastSeenAt: now } })
    .returning({ isNew: sql<boolean>`(xmax = 0)` });

  return { deviceIdHash, isNew: row.isNew };
};
