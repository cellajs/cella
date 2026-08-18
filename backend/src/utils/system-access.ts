import type { Context } from 'hono';
import { env } from '#/env';
import { getIp } from '#/utils/get-ip';

/** `SYSTEM_ADMIN_IP_ALLOWLIST`: 'none' denies every request, '*' allows every request, otherwise a comma-separated IP list. */
export const isSystemAccessAllowed = (ctx: Context): boolean => {
  const config = env.SYSTEM_ADMIN_IP_ALLOWLIST;
  if (config === 'none') return false;
  if (config === '*') return true;
  const ip = getIp(ctx);
  return !!ip && config.split(',').includes(ip);
};
