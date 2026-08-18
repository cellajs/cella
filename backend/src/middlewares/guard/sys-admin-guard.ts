import type { MiddlewareHandler } from 'hono';
import { every } from 'hono/combine';
import { ipRestriction } from 'hono/ip-restriction';
import { appConfig } from 'shared';
import { AppError } from '#/core/error';
import { setMiddlewareExtension } from '#/core/x-middleware';
import { sendAccountSecurityEmail } from '#/modules/auth/general/helpers/send-account-security-email';
import { getIp } from '#/utils/get-ip';
import { scrubPath } from '#/utils/scrub-url';
import { env } from '../../env';

const allowList = env.SYSTEM_ADMIN_IP_ALLOWLIST === 'none' ? [] : env.SYSTEM_ADMIN_IP_ALLOWLIST.split(',');

/** Only users holding the 'admin' system role proceed; anyone else triggers a security notification. */
const sysAdminCheck: MiddlewareHandler = async (ctx, next) => {
  const user = ctx.var.user;
  const isSystemAdmin = ctx.var.isSystemAdmin;

  if (!isSystemAdmin) {
    const ip = getIp(ctx) ?? 'unknown';
    sendAccountSecurityEmail({ email: appConfig.securityEmail, name: 'Security' }, 'sysadmin-fail', {
      ip,
      route: scrubPath(ctx.req.path),
      timestamp: new Date().toISOString(),
    });
    throw new AppError(403, 'no_sysadmin', 'warn', { meta: { user: user.id } });
  }

  await next();
};

/** Both the system admin check and the IP restriction must pass. */
const combinedMiddleware: MiddlewareHandler = every(
  sysAdminCheck,
  // hono's ipRestriction wants a `(c) => string` getter; coerce a null IP to '' so it matches no
  // allowlist entry and denies by default without throwing.
  ipRestriction(
    (c) => getIp(c) ?? '',
    { allowList },
    async (remote) => {
      const ip = remote.addr ?? 'unknown';
      sendAccountSecurityEmail({ email: appConfig.securityEmail, name: 'Security' }, 'sysadmin-fail', {
        ip,
        route: 'ip-restricted',
        timestamp: new Date().toISOString(),
      });
      throw new AppError(403, 'forbidden', 'warn');
    },
  ),
);

export const sysAdminGuard = setMiddlewareExtension(combinedMiddleware, {
  functionName: 'sysAdminGuard',
  type: 'x-guard',
  name: 'sysAdmin',
  description: 'Requires system admin + IP whitelist',
});
