import { and, eq, gt, sql } from 'drizzle-orm';
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

interface FindNewDevicesOpts {
  userId: string;
  /** Devices first seen after this ISO timestamp. */
  firstSeenAfter: string;
}

/** The user's devices first seen after `firstSeenAfter`, except their oldest: an account's first browser is never new. */
export const findNewDevices = async (ctx: DbContext, { userId, firstSeenAfter }: FindNewDevicesOpts) => {
  const oldestFirstSeen = sql`(select min(${devicesTable.firstSeenAt}) from ${devicesTable} where ${devicesTable.userId} = ${userId})`;
  return ctx.var.db
    .select({ deviceIdHash: devicesTable.deviceIdHash })
    .from(devicesTable)
    .where(and(eq(devicesTable.userId, userId), gt(devicesTable.firstSeenAt, firstSeenAfter), gt(devicesTable.firstSeenAt, oldestFirstSeen)));
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
