import type { MiddlewareHandler } from 'hono';
import { every } from 'hono/combine';
import { ipRestriction } from 'hono/ip-restriction';
import { setMiddlewareExtension } from '#/docs/x-middleware';
import { AppError } from '#/lib/error';
import { getIp } from '#/utils/get-ip';
import { env } from '../../env';

const allowList = env.REMOTE_SYSTEM_ACCESS_IP.split(',') || [];

/**
 * Internal middleware to check if user is a system admin based on their role.
 * Only allows users with 'admin' in their role to proceed.
 */
const sysAdminCheck: MiddlewareHandler = async (ctx, next) => {
  const user = ctx.var.user;
  const userSystemRole = ctx.var.userSystemRole;

  if (userSystemRole !== 'admin') throw new AppError(403, 'no_sysadmin', 'warn', { meta: { user: user.id } });

  await next();
};

/**
 * Middleware that combines system admin check with IP restriction.
 * Uses `every` function from Hono to ensure both system admin check and IP restriction are passed.
 *
 * @returns Error response or undefined if the user is allowed to proceed.
 */
const combinedMiddleware: MiddlewareHandler = every(
  sysAdminCheck,
  ipRestriction(getIp, { allowList }, async () => {
    throw new AppError(403, 'forbidden', 'warn');
  }),
);

export const sysAdminGuard = setMiddlewareExtension(
  combinedMiddleware,
  'sysAdminGuard',
  'x-guard',
  'Requires system admin + IP whitelist',
);
