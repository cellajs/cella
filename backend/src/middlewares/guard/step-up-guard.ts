import { xMiddleware } from '#/core/x-middleware';
import { requireStepUp } from '#/modules/auth/step-up/helpers/step-up';

/**
 * Account-security actions (factors, MFA, provider connect, OAuth consent, account deletion, minting an API key) need
 * more than a session: a recent proof of the user's presence on this very session, and never an impersonation. Runs
 * after `userGuard`; a refusal is 403 `step_up_required` naming what the user can offer.
 */
export const stepUpGuard = xMiddleware(
  {
    functionName: 'stepUpGuard',
    type: 'x-guard',
    name: 'stepUp',
    description:
      'Requires a recent proof of presence on this session: the enrolled passkey or TOTP, else a fresh sign-in or a confirmed email link. Refuses impersonation.',
  },
  async (ctx, next) => {
    await requireStepUp(ctx.var.session);
    await next();
  },
);
