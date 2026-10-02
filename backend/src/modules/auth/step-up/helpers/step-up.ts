import { AppError } from '#/core/error';
import type { SessionFacts } from '#/modules/auth/sessions-db';
import { TimeSpan } from '#/utils/time-span';

/**
 * What a user can offer to step up: a second factor they hold (`passkey`, `totp`), or, holding none, an emailed
 * confirmation link (`email`) or a fresh sign-in (`sign_in`).
 */
export const stepUpMethods = ['passkey', 'totp', 'email', 'sign_in'] as const;
export type StepUpMethod = (typeof stepUpMethods)[number];

/** How long a sign-in or a step-up counts as a fresh proof of presence. */
export const stepUpWindow = new TimeSpan(10, 'm');

type Factor = Extract<StepUpMethod, 'passkey' | 'totp'>;

export interface StepUpState {
  /** The session proved its user's presence within the window. */
  steppedUp: boolean;
  /** What the user can offer to step up; empty for an impersonation. */
  methods: StepUpMethod[];
  /** The second factor that proves the session now, by a step-up or by its sign-in; null without one. */
  factor: Factor | null;
}

/**
 * Refuses an impersonation: the admin acts as the user, never on the account itself, its sessions or how it is
 * protected. The one spelling of this answer: `requireStepUp`, `sysAdminGuard` and the handlers of stepping up and
 * revoking sessions.
 * @throws AppError 403 `impersonation_forbidden`.
 */
export const refuseImpersonation = (session: SessionFacts): void => {
  if (session.type === 'impersonation') throw new AppError(403, 'impersonation_forbidden', 'warn');
};
