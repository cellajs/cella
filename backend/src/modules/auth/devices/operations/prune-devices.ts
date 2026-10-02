import { baseDb } from '#/db/db';
import { deleteExcessDevices, deleteStaleDevices } from '#/modules/auth/devices/devices-queries';
import { log } from '#/utils/logger';
import { TimeSpan } from '#/utils/time-span';

/** The daily job runs without a request, on the base pool. */
const dbCtx = { var: { db: baseDb } };

/** The device id cookie lives 400 days from its last sign-in, so a row unseen for that long can never match again. */
const DEVICE_TTL = new TimeSpan(400, 'd');

/** Rows kept per user. A browser that drops cookies on exit enrolls a new row at every sign-in; this bounds it. */
const MAX_DEVICES_PER_USER = 50;

/** Removes device rows that can no longer match a browser, then each user's oldest rows beyond the cap. Returns the rows removed. */
export async function pruneDevices(now: Date = new Date()): Promise<number> {
  const seenBefore = new Date(now.getTime() - DEVICE_TTL.milliseconds()).toISOString();

  const expired = await deleteStaleDevices(dbCtx, { seenBefore });
  const excess = await deleteExcessDevices(dbCtx, { maxPerUser: MAX_DEVICES_PER_USER });

  const count = expired.length + excess.length;
  if (count) log.info('Pruned devices', { expired: expired.length, excess: excess.length });
  return count;
}
