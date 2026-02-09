import type { MiddlewareHandler } from 'hono';
import { every } from 'hono/combine';
import { ipRestriction } from 'hono/ip-restriction';
import { setMiddlewareExtension } from '#/docs/x-middleware';
import { AppError } from '#/lib/error';
import { sysAdminGuard } from '#/middlewares/guard/sys-admin-guard';
import { getIp } from '#/utils/get-ip';
import { env } from '../../env';

const allowList = env.REMOTE_SYSTEM_ACCESS_IP.split(',') || [];

/**
 * Middleware that combines system admin check with IP restriction.
 * Uses `every` function from Hono to ensure both system admin check and IP restriction are passed.
 *
 * @returns Error response or undefined if the user is allowed to proceed.
 */
const combinedMiddleware: MiddlewareHandler = every(
  sysAdminGuard,
  ipRestriction(getIp, { allowList }, async () => {
    throw new AppError(403, 'forbidden', 'warn');
  }),
);

export const hasSystemAccess = setMiddlewareExtension(
  combinedMiddleware,
  'hasSystemAccess',
  'x-guard',
  'Requires system admin + IP whitelist',
);
