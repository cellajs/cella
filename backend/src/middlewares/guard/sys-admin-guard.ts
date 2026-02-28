import type { MiddlewareHandler } from 'hono';
import { every } from 'hono/combine';
import { ipRestriction } from 'hono/ip-restriction';
import { appConfig } from 'shared';
import { setMiddlewareExtension } from '#/docs/x-middleware';
import { AppError } from '#/lib/error';
import { sendAccountSecurityEmail } from '#/lib/send-account-security-email';
import { getIp } from '#/utils/get-ip';
import { env } from '../../env';

const allowList = env.SYSTEM_ADMIN_IP_ALLOWLIST === 'none' ? [] : env.SYSTEM_ADMIN_IP_ALLOWLIST.split(',');

/**
 * Internal middleware to check if user is a system admin based on their role.
 * Only allows users with 'admin' in their role to proceed.
 */
const sysAdminCheck: MiddlewareHandler = async (ctx, next) => {
  const user = ctx.var.user;
  const isSystemAdmin = ctx.var.isSystemAdmin;

  if (!isSystemAdmin) {
    const ip = getIp(ctx) ?? 'unknown';
    sendAccountSecurityEmail({ email: appConfig.securityEmail, name: 'Security' }, 'sysadmin-fail', {
      ip,
      route: ctx.req.path,
      timestamp: new Date().toISOString(),
    });
    throw new AppError(403, 'no_sysadmin', 'warn', { meta: { user: user.id } });
  }

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
  ipRestriction(getIp, { allowList }, async (remote) => {
    const ip = remote.addr ?? 'unknown';
    sendAccountSecurityEmail({ email: appConfig.securityEmail, name: 'Security' }, 'sysadmin-fail', {
      ip,
      route: 'ip-restricted',
      timestamp: new Date().toISOString(),
    });
    throw new AppError(403, 'forbidden', 'warn');
  }),
);

export const sysAdminGuard = setMiddlewareExtension(combinedMiddleware, {
  functionName: 'sysAdminGuard',
  type: 'x-guard',
  name: 'sysAdmin',
  description: 'Requires system admin + IP whitelist',
});
