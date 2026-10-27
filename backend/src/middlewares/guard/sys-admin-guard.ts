import type { MiddlewareHandler } from 'hono';
import { every } from 'hono/combine';
import { ipRestriction } from 'hono/ip-restriction';
import { scrubUrl } from 'shared/utils/scrub-url';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { setMiddlewareExtension } from '#/core/x-middleware';
import { sendSecurityInboxEmail } from '#/modules/auth/general/helpers/send-account-security-email';
import { refuseImpersonation } from '#/modules/auth/step-up/helpers/step-up';
import { getIp } from '#/utils/get-ip';
import { systemAdminAllowList } from '#/utils/system-access';

/**
 * Only users holding the 'admin' system role proceed; anyone else triggers a security notification. An impersonation
 * is refused first: system administration is done as oneself, and the role check would judge the impersonated user
 * and raise an alert about the admin's own request.
 */
const sysAdminCheck: MiddlewareHandler<Env> = async (ctx, next) => {
  const { user, isSystemAdmin, session } = ctx.var;

  refuseImpersonation(session);

  if (!isSystemAdmin) {
    const ip = getIp(ctx) ?? 'unknown';
    sendSecurityInboxEmail('sysadmin-fail', { ip, route: scrubUrl(ctx.req.path) });
    throw new AppError(403, 'no_sysadmin', 'warn', { meta: { user: user.id } });
  }

  await next();
};

/** Refuses an address outside `SYSTEM_ADMIN_IP_ALLOWLIST`, with a security notification. */
const allowedIpCheck = ipRestriction(
  // hono's ipRestriction wants a `(c) => string` getter. A request without an IP reads as '', which hono refuses with
  // its own 403 before the allow-list and the refusal below run.
  (c) => getIp(c) ?? '',
  { allowList: systemAdminAllowList() },
  async (remote) => {
    const ip = remote.addr ?? 'unknown';
    sendSecurityInboxEmail('sysadmin-fail', { ip, route: 'ip-restricted' });
    throw new AppError(403, 'forbidden', 'warn');
  },
);

/** Both the system admin check and the IP restriction must pass, in that order. */
export const sysAdminGuard = setMiddlewareExtension(every(sysAdminCheck, allowedIpCheck), {
  functionName: 'sysAdminGuard',
  type: 'x-guard',
  requires: ['session'],
  name: 'sysAdmin',
  description: 'Requires the system admin role and an allowed IP address; refuses impersonation',
});
