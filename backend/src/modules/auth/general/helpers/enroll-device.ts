import { sql } from 'drizzle-orm';
import { baseDb as db } from '#/db/db';
import { devicesTable } from '#/modules/auth/devices-db';
import type { SignInContext } from '#/modules/auth/general/helpers/session';
import type { AuthStrategy } from '#/modules/auth/sessions-db';
import { hashDeviceIdForUser } from '#/utils/hash-pii';
import { getIsoDate } from '#/utils/iso-date';

/**
 * Records that the user signed in from this browser and tells whether it is the first time. One upsert decides it: `xmax = 0`
 * holds only for a freshly inserted row, so of several parallel sign-ins exactly one sees `isNew`.
 */
export const enrollDevice = async (
  userId: string,
  deviceId: string,
  context: Pick<SignInContext, 'device' | 'country'>,
  strategy: AuthStrategy,
) => {
  const deviceIdHash = hashDeviceIdForUser(deviceId, userId);
  const now = getIsoDate();

  const seen = {
    lastSeenAt: now,
    lastStrategy: strategy,
    deviceName: context.device.name,
    deviceType: context.device.type,
    deviceOs: context.device.os,
    browser: context.device.browser,
    ipCountry: context.country,
  };

  const [row] = await db
    .insert(devicesTable)
    .values({ userId, deviceIdHash, firstSeenAt: now, ...seen })
    .onConflictDoUpdate({ target: [devicesTable.userId, devicesTable.deviceIdHash], set: seen })
    .returning({ isNew: sql<boolean>`(xmax = 0)` });

  return { deviceIdHash, isNew: row.isNew };
};
