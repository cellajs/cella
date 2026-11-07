import { isStrategyEnabled } from 'shared';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { getStepUpFacts } from '#/modules/auth/sessions/sessions-queries';
import { type StepUpMethod, type StepUpState, type StepUpTier, stepUpWindow } from '#/modules/auth/step-up/helpers/step-up';
import { hashToken } from '#/utils/hash-token';
import { isoDateAgo } from '#/utils/iso-date';

const dbCtx = { var: { db: baseDb } };

/** A session as one request presents it: its facts, and the step-up cookie this browser holds. */
type StepUpContext = { var: Pick<Env['Variables'], 'session' | 'stepUpCookie'> };

const factorMethods = ['passkey', 'totp'] as const;

/**
 * Whether a session stands stepped up now for `tier`, and what its user can offer when it does not (see `stepUpTiers`).
 * A factor the user holds (for a method the app has on) counts when proven within the window: by a step-up, by setting
 * it up, by the MFA completion that minted the session or by a passkey sign-in. So does an SSO sign-in stamped `sso`.
 * A user without a factor proves a fresh first factor for `account` and `enroll`: a sign-in within the window or an
 * emailed code. An app with no factor method on reads `factor` as `account`, since nobody could set one up. Read fresh
 * from the database, so a stamp set in another process counts at once.
 */
export const readStepUp = async (ctx: StepUpContext, tier: StepUpTier): Promise<StepUpState> => {
  const { session, stepUpCookie } = ctx.var;
  const refused: StepUpState = { steppedUp: false, methods: [], factor: null };
  const row = await getStepUpFacts(dbCtx, {
    sessionId: session.id,
    userId: session.userId,
    since: isoDateAgo(stepUpWindow),
    presentedSecret: stepUpCookie ? hashToken(stepUpCookie) : undefined,
  });
  if (!row) return refused;

  const canEnroll = factorMethods.some((method) => isStrategyEnabled(method));
  const effectiveTier = tier === 'factor' && !canEnroll ? 'account' : tier;

  const held = { passkey: row.hasPasskey, totp: row.hasTotp };
  const factors = factorMethods.filter((method) => held[method] && isStrategyEnabled(method));

  if (factors.length === 0) {
    if (effectiveTier === 'factor') return { steppedUp: row.stampedVia === 'sso', methods: ['enroll'], factor: null };
    return { steppedUp: !!row.stampedVia || row.signedInRecently, methods: ['email'], factor: null };
  }

  // Only a factor the user holds counts: an emailed code stands in for one only while setting up a new factor.
  const stampedWith = factors.find((method) => method === row.stampedVia);
  const signedInWith = row.signedInRecently ? factors.find((method) => method === session.authStrategy) : undefined;
  const factor = stampedWith ?? signedInWith ?? null;

  // With MFA off the mailbox signs the account in, so it may also replace a lost factor without weakening anything.
  const recovery: StepUpMethod[] = row.mfaRequired || !canEnroll ? [] : [effectiveTier === 'enroll' ? 'email' : 'enroll'];
  const recovered = recovery.includes('email') && row.stampedVia === 'email';

  return { steppedUp: !!factor || row.stampedVia === 'sso' || recovered, methods: [...factors, ...recovery], factor };
};

/**
 * Refuses an action of `tier` on a session that does not stand stepped up for it. A demo session never does: a demo
 * account adds no sign-in method, proves no address, hands out no lasting access and is never deleted by hand, so it
 * stays the throwaway its tenant's removal takes along.
 * @returns The step-up state, with the factor that proves the session.
 * @throws AppError 403 `demo_session_restricted` on a demo session, else 403 `step_up_required` with what the user can
 * offer in `meta.methods`.
 */
export const requireStepUp = async (ctx: StepUpContext, tier: StepUpTier): Promise<StepUpState> => {
  if (ctx.var.session.authStrategy === 'demo') throw new AppError(403, 'demo_session_restricted', 'warn');
  const state = await readStepUp(ctx, tier);
  if (!state.steppedUp) throw new AppError(403, 'step_up_required', 'info', { meta: { methods: state.methods } });
  return state;
};
