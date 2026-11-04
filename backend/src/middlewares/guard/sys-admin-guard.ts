import { scrubUrl } from 'shared/utils/scrub-url';
import { AppError } from '#/core/error';
import { xMiddleware } from '#/core/x-middleware';
import { sendSecurityInboxEmail } from '#/modules/auth/general/helpers/send-account-security-email';
import { getIp } from '#/utils/get-ip';

/**
 * Only users holding the 'admin' system role proceed: `isSystemAdmin`, which `userGuard` sets only from an address on
 * `SYSTEM_ADMIN_IP_ALLOWLIST`. Anyone else is refused and logged every time, and raises a security notification at
 * most once an hour.
 */
export const sysAdminGuard = xMiddleware(
  {
    functionName: 'sysAdminGuard',
    type: 'x-guard',
    errors: [403],
    requires: ['session'],
    name: 'System admin',
    description: 'Requires the system admin role and a request from an allowed IP address.',
  },
  async (ctx, next) => {
    const { user, isSystemAdmin } = ctx.var;

    if (!isSystemAdmin) {
      const ip = getIp(ctx) ?? 'unknown';
      await sendSecurityInboxEmail('sysadmin-fail', { ip, route: scrubUrl(ctx.req.path) }, user.id);
      throw new AppError(403, 'no_sysadmin', 'warn', { meta: { user: user.id } });
    }

    await next();
  },
);
