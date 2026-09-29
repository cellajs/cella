import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import type { Env } from '#/core/context';
import { baseDb as db } from '#/db/db';
import { devicesTable } from '#/modules/auth/devices-db';
import { getAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { emailsTable } from '#/modules/user/emails-db';
import { hashDeviceIdForUser } from '#/utils/hash-pii';

/**
 * Whether this browser has signed in to the account that holds `email`: it carries the signed device-id cookie that
 * sign-in sets, and the account has a devices row for it. Only such a browser learns that the address has an account.
 * Without the cookie nothing is looked up.
 * @param email - The normalized address.
 */
export const isRecognizedBrowser = async (ctx: Context<Env>, email: string): Promise<boolean> => {
  const deviceId = await getAuthCookie(ctx, 'device-id');
  if (!deviceId) return false;

  // One query whether or not the address has an account; the hash is keyed by the user, so it is compared here.
  const devices = await db
    .select({ userId: devicesTable.userId, deviceIdHash: devicesTable.deviceIdHash })
    .from(emailsTable)
    .innerJoin(devicesTable, eq(devicesTable.userId, emailsTable.userId))
    .where(eq(emailsTable.email, email));

  return devices.some(({ userId, deviceIdHash }) => deviceIdHash === hashDeviceIdForUser(deviceId, userId));
};
