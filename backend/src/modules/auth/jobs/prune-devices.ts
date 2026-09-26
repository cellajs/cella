import { lt, sql } from 'drizzle-orm';
import { baseDb as db } from '#/db/db';
import { devicesTable } from '#/modules/auth/devices-db';
import { log } from '#/utils/logger';
import { TimeSpan } from '#/utils/time-span';

/** The device id cookie lives 400 days from its last sign-in, so a row unseen for that long can never match again. */
const DEVICE_TTL = new TimeSpan(400, 'd');

/** Rows kept per user. A browser that drops cookies on exit enrolls a new row at every sign-in; this bounds it. */
const MAX_DEVICES_PER_USER = 50;

/** Removes device rows that can no longer match a browser, then each user's oldest rows beyond the cap. Returns the rows removed. */
export async function pruneDevices(now: Date = new Date()): Promise<number> {
  const seenBefore = new Date(now.getTime() - DEVICE_TTL.milliseconds()).toISOString();

  const expired = await db
    .delete(devicesTable)
    .where(lt(devicesTable.lastSeenAt, seenBefore))
    .returning({ userId: devicesTable.userId });

  const excess = await db
    .delete(devicesTable)
    .where(
      sql`(${devicesTable.userId}, ${devicesTable.deviceIdHash}) in (
        select user_id, device_id_hash from (
          select user_id, device_id_hash, row_number() over (partition by user_id order by last_seen_at desc) as position
          from ${devicesTable}
        ) ranked
        where position > ${MAX_DEVICES_PER_USER}
      )`,
    )
    .returning({ userId: devicesTable.userId });

  const count = expired.length + excess.length;
  if (count) log.info('Pruned devices', { expired: expired.length, excess: excess.length });
  return count;
}
