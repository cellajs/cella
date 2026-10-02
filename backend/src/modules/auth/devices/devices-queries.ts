import { and, eq, gt, lt, sql } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import { devicesTable } from '#/modules/auth/devices/devices-db';
import { emailsTable } from '#/modules/user/emails-db';
import { getIsoDate } from '#/utils/iso-date';

interface UpsertDeviceOpts {
  userId: string;
  deviceIdHash: string;
}

/**
 * Records a sign-in from this browser and tells whether its row is new. One upsert decides it: `xmax = 0` holds only for a
 * freshly inserted row, so of several parallel sign-ins exactly one sees `isNew`.
 */
export const upsertDevice = async (ctx: DbContext, { userId, deviceIdHash }: UpsertDeviceOpts) => {
  const now = getIsoDate();
  const [row] = await ctx.var.db
    .insert(devicesTable)
    .values({ userId, deviceIdHash, firstSeenAt: now, lastSeenAt: now })
    .onConflictDoUpdate({ target: [devicesTable.userId, devicesTable.deviceIdHash], set: { lastSeenAt: now } })
    .returning({ isNew: sql<boolean>`(xmax = 0)` });
  return row;
};

interface FindDevicesByEmailOpts {
  /** The normalized address. */
  email: string;
}

/** The device rows of the account that holds `email`; empty when no account does. */
export const findDevicesByEmail = async (ctx: DbContext, { email }: FindDevicesByEmailOpts) => {
  return ctx.var.db
    .select({ userId: devicesTable.userId, deviceIdHash: devicesTable.deviceIdHash })
    .from(emailsTable)
    .innerJoin(devicesTable, eq(devicesTable.userId, emailsTable.userId))
    .where(eq(emailsTable.email, email));
};

interface CountNotifiedDevicesOpts {
  userId: string;
  /** Count notices sent after this ISO timestamp. */
  since: string;
}

/** How many new sign-in notices went out to the user since `since`. */
export const countNotifiedDevices = async (ctx: DbContext, { userId, since }: CountNotifiedDevicesOpts) => {
  return ctx.var.db.$count(devicesTable, and(eq(devicesTable.userId, userId), gt(devicesTable.notifiedAt, since)));
};

interface UpdateDeviceNotifiedAtOpts {
  userId: string;
  deviceIdHash: string;
}

/** Marks that a new sign-in notice went out for this device row. */
export const updateDeviceNotifiedAt = async (ctx: DbContext, { userId, deviceIdHash }: UpdateDeviceNotifiedAtOpts) => {
  await ctx.var.db
    .update(devicesTable)
    .set({ notifiedAt: getIsoDate() })
    .where(and(eq(devicesTable.userId, userId), eq(devicesTable.deviceIdHash, deviceIdHash)));
};

interface DeleteStaleDevicesOpts {
  /** Rows last seen before this ISO timestamp go. */
  seenBefore: string;
}

/** Removes device rows last seen before `seenBefore`. */
export const deleteStaleDevices = async (ctx: DbContext, { seenBefore }: DeleteStaleDevicesOpts) => {
  return ctx.var.db.delete(devicesTable).where(lt(devicesTable.lastSeenAt, seenBefore)).returning({ userId: devicesTable.userId });
};

interface DeleteExcessDevicesOpts {
  /** Rows kept per user, the most recently seen. */
  maxPerUser: number;
}

/** Removes each user's least recently seen device rows beyond `maxPerUser`. */
export const deleteExcessDevices = async (ctx: DbContext, { maxPerUser }: DeleteExcessDevicesOpts) => {
  return ctx.var.db
    .delete(devicesTable)
    .where(
      sql`(${devicesTable.userId}, ${devicesTable.deviceIdHash}) in (
        select user_id, device_id_hash from (
          select user_id, device_id_hash, row_number() over (partition by user_id order by last_seen_at desc) as position
          from ${devicesTable}
        ) ranked
        where position > ${maxPerUser}
      )`,
    )
    .returning({ userId: devicesTable.userId });
};
