import type { MiddlewareHandler } from 'hono';
import { every } from 'hono/combine';
import { ipRestriction } from 'hono/ip-restriction';
import { scrubUrl } from 'shared/utils/scrub-url';
import { AppError } from '#/core/error';
import { setMiddlewareExtension } from '#/core/x-middleware';
import { sendSecurityInboxEmail } from '#/modules/auth/general/helpers/send-account-security-email';
import { refuseImpersonation } from '#/modules/auth/step-up/helpers/step-up';
import { getIp } from '#/utils/get-ip';
import { env } from '../../env';

const allowList = env.SYSTEM_ADMIN_IP_ALLOWLIST === 'none' ? [] : env.SYSTEM_ADMIN_IP_ALLOWLIST.split(',');

/**
 * Only users holding the 'admin' system role proceed; anyone else triggers a security notification. An impersonation
 * is refused first: system administration is done as oneself, and the role check would judge the impersonated user
 * and raise an alert about the admin's own request.
 */
const sysAdminCheck: MiddlewareHandler = async (ctx, next) => {
  const user = ctx.var.user;
  const isSystemAdmin = ctx.var.isSystemAdmin;

  refuseImpersonation(ctx.var.session);

  if (!isSystemAdmin) {
    const ip = getIp(ctx) ?? 'unknown';
    sendSecurityInboxEmail('sysadmin-fail', { ip, route: scrubUrl(ctx.req.path), timestamp: new Date().toISOString() });
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
      sendSecurityInboxEmail('sysadmin-fail', { ip, route: 'ip-restricted', timestamp: new Date().toISOString() });
      throw new AppError(403, 'forbidden', 'warn');
    },
  ),
);

export const sysAdminGuard = setMiddlewareExtension(combinedMiddleware, {
  functionName: 'sysAdminGuard',
  type: 'x-guard',
  name: 'sysAdmin',
  description: 'Requires the system admin role and an allowed IP address; refuses impersonation',
});
