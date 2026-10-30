import { xMiddleware } from '#/core/x-middleware';
import { type StepUpTier, stepUpWindow } from '#/modules/auth/step-up/helpers/step-up';
import { requireStepUp } from '#/modules/auth/step-up/operations/read-step-up';

const stepUpMinutes = stepUpWindow.seconds() / 60;

/** A guard for the step-up tier `tier`: runs after `userGuard`, and a refusal is 403 `step_up_required` naming what the user can offer. */
const stepUpTierGuard = (tier: StepUpTier, functionName: string, name: string, description: string) =>
  xMiddleware({ functionName, type: 'x-guard', errors: [403], requires: ['session'], name, description }, async (ctx, next) => {
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
  'Step-up',
  `The user confirms it's them on this session in the last ${stepUpMinutes} minutes: with a passkey or TOTP code if they have one, otherwise a fresh sign-in or an emailed code. Refused during impersonation.`,
);

/** For actions that hand out lasting access: minting an API key, creating or re-enabling a service account. */
export const stepUpFactorGuard = stepUpTierGuard(
  'factor',
  'stepUpFactorGuard',
  'Step-up: second factor',
  `The user confirms it's them in the last ${stepUpMinutes} minutes with a passkey or TOTP code, or an SSO sign-in where the institution confirmed MFA. Someone without a second factor sets one up first. Refused during impersonation.`,
);

/** For setting up a second factor: a passkey or an authenticator app. */
export const stepUpEnrollGuard = stepUpTierGuard(
  'enroll',
  'stepUpEnrollGuard',
  'Step-up: new factor',
  `The user confirms it's them on this session in the last ${stepUpMinutes} minutes: with a passkey or TOTP code if they have one, otherwise a fresh sign-in or an emailed code. Someone who lost their factor can also use an emailed code while MFA is off. Refused during impersonation.`,
);
