import { baseDb } from '#/db/db';
import { upsertDevice } from '#/modules/auth/devices/devices-queries';
import { hashDeviceIdForUser } from '#/utils/hash-pii';

/** Device rows are written on the base pool: sign-in runs this without a request too. */
const dbCtx = { var: { db: baseDb } };

/**
 * Records that the user signed in from this browser and tells whether it is the first time; of several parallel sign-ins
 * exactly one sees `isNew`.
 */
export const enrollDevice = async (userId: string, deviceId: string) => {
  const deviceIdHash = hashDeviceIdForUser(deviceId, userId);
  const { isNew } = await upsertDevice(dbCtx, { userId, deviceIdHash });
  return { deviceIdHash, isNew };
};
