import { xMiddleware } from '#/core/x-middleware';
import type { StepUpTier } from '#/modules/auth/step-up/helpers/step-up';
import { requireStepUp } from '#/modules/auth/step-up/operations/read-step-up';

/** A guard for the step-up tier `tier`: runs after `userGuard`, and a refusal is 403 `step_up_required` naming what the user can offer. */
const stepUpTierGuard = (tier: StepUpTier, functionName: string, name: string, description: string) =>
  xMiddleware({ functionName, type: 'x-guard', requires: ['session'], name, description }, async (ctx, next) => {
    await requireStepUp(ctx.var.session, tier);
    await next();
  });

/**
 * Account-security actions need more than a session: a recent proof of the user's presence on this very session, and
 * never an impersonation. How much proof depends on what the action does (`stepUpTiers`): this guard is for changing
 * or ending the account (factor deletes, MFA, provider connect, account deletion).
 */
export const stepUpGuard = stepUpTierGuard(
  'account',
  'stepUpGuard',
  'stepUp',
  'Requires a recent proof of presence on this session: a passkey or TOTP the user holds, else a fresh sign-in or an emailed code; refuses impersonation',
);

/** For actions that hand out lasting access: minting an API key, creating or re-enabling a service account. */
export const stepUpFactorGuard = stepUpTierGuard(
  'factor',
  'stepUpFactorGuard',
  'stepUpFactor',
  'Requires a recent proof of a second factor the user holds, or an SSO sign-in whose institution asserted MFA; refuses impersonation',
);

/** For setting up a second factor: a passkey or an authenticator app. */
export const stepUpEnrollGuard = stepUpTierGuard(
  'enroll',
  'stepUpEnrollGuard',
  'stepUpEnroll',
  'Requires a recent proof of presence on this session: a passkey or TOTP the user holds, a fresh sign-in or an emailed code; refuses impersonation',
);
