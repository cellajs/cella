import type { Context } from 'hono';
import { env } from '#/env';
import { getIp } from '#/utils/get-ip';

/** `SYSTEM_ADMIN_IP_ALLOWLIST` as a list: 'none' allows no address, '*' every address, otherwise the comma-separated IPs. */
export const systemAdminAllowList = (): string[] => (env.SYSTEM_ADMIN_IP_ALLOWLIST === 'none' ? [] : env.SYSTEM_ADMIN_IP_ALLOWLIST.split(','));

/** Whether the request's address is on the system admin allow-list. */
export const isSystemAccessAllowed = (ctx: Context): boolean => {
  const allowList = systemAdminAllowList();
  if (allowList.includes('*')) return true;
  const ip = getIp(ctx);
  return !!ip && allowList.includes(ip);
};
