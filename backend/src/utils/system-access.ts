import type { Context } from 'hono';
import { env } from '#/env';
import { getIp } from '#/utils/get-ip';

/**
 * Check if the current request is allowed system (admin) access
 * based on the SYSTEM_ADMIN_IP_ALLOWLIST env var.
 *
 * - 'none': always denied
 * - '*': always allowed
 * - comma-separated IPs: allowed only if requester IP is in the list
 */
export const isSystemAccessAllowed = (ctx: Context): boolean => {
  const config = env.SYSTEM_ADMIN_IP_ALLOWLIST;
  if (config === 'none') return false;
  if (config === '*') return true;
  const ip = getIp(ctx);
  return !!ip && config.split(',').includes(ip);
};
