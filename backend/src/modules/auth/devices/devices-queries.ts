import { and, eq, gt, sql } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import { devicesTable } from '#/modules/auth/devices/devices-db';
import { emailsTable } from '#/modules/user/emails-db';
import { getIsoDate } from '#/utils/iso-date';

/**
 * Records a sign-in from this browser and tells whether its row is new. One upsert decides it: `xmax = 0` holds only for a
 * freshly inserted row, so of several parallel sign-ins exactly one sees `isNew`.
 */
export const upsertDevice = async (ctx: DbContext, { userId, deviceIdHash }: { userId: string; deviceIdHash: string }) => {
  const now = getIsoDate();
  const [row] = await ctx.var.db
    .insert(devicesTable)
    .values({ userId, deviceIdHash, createdAt: now, lastSignInAt: now })
    .onConflictDoUpdate({ target: [devicesTable.userId, devicesTable.deviceIdHash], set: { lastSignInAt: now } })
    .returning({ isNew: sql<boolean>`(xmax = 0)` });
  return row;
};

interface FindDevicesByEmailOpts {
  /** The normalized address. */
  email: string;
}

/** The device rows of the account that holds `email`; empty when no account does. */
export const findDevicesByEmail = async (ctx: DbContext, { email }: FindDevicesByEmailOpts) =>
  ctx.var.db
    .select({ userId: devicesTable.userId, deviceIdHash: devicesTable.deviceIdHash })
    .from(emailsTable)
    .innerJoin(devicesTable, eq(devicesTable.userId, emailsTable.userId))
    .where(eq(emailsTable.email, email));

interface FindNewDevicesOpts {
  userId: string;
  /** Devices first signed in from after this ISO timestamp. */
  createdAfter: string;
}

/** The user's devices first signed in from after `createdAfter`, except their oldest: an account's first browser is never new. */
export const findNewDevices = async (ctx: DbContext, { userId, createdAfter }: FindNewDevicesOpts) => {
  const oldestCreatedAt = sql`(select min(${devicesTable.createdAt}) from ${devicesTable} where ${devicesTable.userId} = ${userId})`;
  return ctx.var.db
    .select({ deviceIdHash: devicesTable.deviceIdHash })
    .from(devicesTable)
    .where(and(eq(devicesTable.userId, userId), gt(devicesTable.createdAt, createdAfter), gt(devicesTable.createdAt, oldestCreatedAt)));
};

interface CountMailedDevicesOpts {
  userId: string;
  /** Count mails sent after this ISO timestamp. */
  since: string;
}

/** How many new sign-in mails went out to the user since `since`. */
export const countMailedDevices = async (ctx: DbContext, { userId, since }: CountMailedDevicesOpts) =>
  ctx.var.db.$count(devicesTable, and(eq(devicesTable.userId, userId), gt(devicesTable.mailedAt, since)));

/** Stamps the moment a new sign-in mail went out for this device row. */
export const stampDeviceMailed = async (ctx: DbContext, { userId, deviceIdHash }: { userId: string; deviceIdHash: string }) => {
  await ctx.var.db
    .update(devicesTable)
    .set({ mailedAt: getIsoDate() })
    .where(and(eq(devicesTable.userId, userId), eq(devicesTable.deviceIdHash, deviceIdHash)));
};
