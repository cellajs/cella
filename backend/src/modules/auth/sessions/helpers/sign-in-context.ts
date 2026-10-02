import type { Context } from 'hono';
import { nanoid } from 'shared/utils/nanoid';
import type { Env } from '#/core/context';
import { lookupIp } from '#/lib/geoip';
import { getAuthCookie, setAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { deviceInfo } from '#/modules/auth/sessions/helpers/device-info';
import type { SessionTypes } from '#/modules/auth/sessions/sessions-db';
import { getIp } from '#/utils/get-ip';
import { TimeSpan } from '#/utils/time-span';

/** Chrome caps cookie lifetime at 400 days; the device id slides forward on every sign-in. */
const DEVICE_ID_LIFESPAN = new TimeSpan(400, 'd');

/** Get or mint the opaque per-browser device id: set only on successful sign-in and refreshed each sign-in, so active devices never expire. */
const ensureDeviceId = async (ctx: Context<Env>): Promise<string> => {
  const existing = await getAuthCookie(ctx, 'device-id');
  const deviceId = existing || nanoid(24);
  await setAuthCookie(ctx, 'device-id', deviceId, DEVICE_ID_LIFESPAN);
  return deviceId;
};

/** What the sign-in request says about the browser and the network. Raw IP and device id stay in memory; only their hashes are stored. */
export type SignInContext = {
  rawIp: string | null;
  country: string | null;
  asn: number | null;
  device: ReturnType<typeof deviceInfo>;
  /** Null for impersonation: the browser belongs to the admin. */
  deviceId: string | null;
};

/** The only part of session creation that reads the request. Mints or refreshes the device id cookie as a side effect. */
export const collectSignInContext = async (ctx: Context<Env>, type: SessionTypes): Promise<SignInContext> => {
  const rawIp = getIp(ctx);
  const { country, asn } = await lookupIp(rawIp);
  const deviceId = type === 'impersonation' ? null : await ensureDeviceId(ctx);

  return { rawIp, country, asn, device: deviceInfo(ctx), deviceId };
};
