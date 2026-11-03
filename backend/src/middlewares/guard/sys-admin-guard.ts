import { scrubUrl } from 'shared/utils/scrub-url';
import { AppError } from '#/core/error';
import { xMiddleware } from '#/core/x-middleware';
import { sendSecurityInboxEmail } from '#/modules/auth/general/helpers/send-account-security-email';
import { refuseImpersonation } from '#/modules/auth/step-up/helpers/step-up';
import { getIp } from '#/utils/get-ip';

/**
 * Only users holding the 'admin' system role proceed: `isSystemAdmin`, which `userGuard` sets only from an address on
 * `SYSTEM_ADMIN_IP_ALLOWLIST`. Anyone else is refused and logged every time, and raises a security notification at
 * most once an hour. An impersonation is refused first: system administration is done as oneself, and the role check
 * would judge the impersonated user and raise an alert about the admin's own request.
 */
export const sysAdminGuard = xMiddleware(
  {
    functionName: 'sysAdminGuard',
    type: 'x-guard',
    errors: [403],
    requires: ['session'],
    name: 'System admin',
    description: 'Requires the system admin role and a request from an allowed IP address. Refused during impersonation.',
  },
  async (ctx, next) => {
    const { user, isSystemAdmin, session } = ctx.var;

    refuseImpersonation(session);

    if (!isSystemAdmin) {
      const ip = getIp(ctx) ?? 'unknown';
      await sendSecurityInboxEmail('sysadmin-fail', { ip, route: scrubUrl(ctx.req.path) }, user.id);
      throw new AppError(403, 'no_sysadmin', 'warn', { meta: { user: user.id } });
    }

    await next();
  },
);
