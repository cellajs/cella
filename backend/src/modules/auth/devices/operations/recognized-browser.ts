import type { Context } from 'hono';
import type { Env } from '#/core/context';
import { baseDb } from '#/db/db';
import { findDevicesByEmail } from '#/modules/auth/devices/devices-queries';
import { getAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { hashDeviceIdForUser } from '#/utils/hash-pii';

/** Device rows are read on the base pool, whatever the route's context holds. */
const dbCtx = { var: { db: baseDb } };

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
  const devices = await findDevicesByEmail(dbCtx, { email });

  return devices.some(({ userId, deviceIdHash }) => deviceIdHash === hashDeviceIdForUser(deviceId, userId));
};
