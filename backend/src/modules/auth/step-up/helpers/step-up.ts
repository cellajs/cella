import { AppError } from '#/core/error';
import type { SessionFacts } from '#/modules/auth/sessions/sessions-db';
import { TimeSpan } from '#/utils/time-span';

/**
 * What a user can offer to step up: a second factor they hold (`passkey`, `totp`), an emailed code (`email`), or
 * setting up a new factor (`enroll`), which steps the session up with it.
 */
export const stepUpMethods = ['passkey', 'totp', 'email', 'enroll'] as const;
export type StepUpMethod = (typeof stepUpMethods)[number];

/**
 * How much an action asks of the session:
 * - `factor`: it hands out lasting access (an API key, a service account, an OAuth grant), so it needs a second factor
 *   the user holds, or an SSO sign-in whose institution asserted MFA. A user without a factor sets one up first.
 * - `account`: it changes or ends the account (a provider connect, a factor delete, MFA, account deletion): a factor
 *   the user holds, else a sign-in within the window or an emailed code.
 * - `enroll`: it sets up a factor. As `account`, and a user with a lost factor may use an emailed code while MFA is off.
 */
export const stepUpTiers = ['factor', 'account', 'enroll'] as const;
export type StepUpTier = (typeof stepUpTiers)[number];

/** How long a sign-in or a step-up counts as a fresh proof of presence. */
export const stepUpWindow = new TimeSpan(10, 'm');

type Factor = Extract<StepUpMethod, 'passkey' | 'totp'>;

export interface StepUpState {
  /** The session proved its user's presence within the window, well enough for the tier. */
  steppedUp: boolean;
  /** What the user can offer to step up for the tier; empty for an impersonation. */
  methods: StepUpMethod[];
  /** The second factor that proves the session now, by a step-up or by its sign-in; null without one. */
  factor: Factor | null;
}

/**
 * Refuses an impersonation: the admin acts as the user, never on the account itself, its sessions or how it is
 * protected. The one spelling of this answer.
 * @throws AppError 403 `impersonation_forbidden`.
 */
export const refuseImpersonation = (session: SessionFacts): void => {
  if (session.type === 'impersonation') throw new AppError(403, 'impersonation_forbidden', 'warn');
};
