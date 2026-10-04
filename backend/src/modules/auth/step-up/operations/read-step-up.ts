import { isStrategyEnabled } from 'shared';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import type { SessionFacts } from '#/modules/auth/sessions/sessions-db';
import { getStepUpFacts } from '#/modules/auth/sessions/sessions-queries';
import { refuseImpersonation, type StepUpState, stepUpWindow } from '#/modules/auth/step-up/helpers/step-up';

/** Step-up state is read on the base pool, whatever the route's context holds. */
const dbCtx = { var: { db: baseDb } };

/**
 * Whether a session stands stepped up now, and what its user can offer when it does not. A user with a passkey or
 * TOTP (for a method the app has on) proves one of them within the window: a step-up with it, the MFA completion that
 * minted the session (stamped at creation), or a sign-in with it (a passkey sign-in). A user without proves a fresh
 * first factor: any sign-in within the window, or a step-up through an emailed link. Read fresh from the database, so
 * a stamp set in another process counts at once; an impersonation never stands.
 */
export const readStepUp = async (session: SessionFacts): Promise<StepUpState> => {
  const refused: StepUpState = { steppedUp: false, methods: [], factor: null };
  if (session.type === 'impersonation') return refused;

  const since = new Date(Date.now() - stepUpWindow.milliseconds()).toISOString();
  const row = await getStepUpFacts(dbCtx, { sessionId: session.id, userId: session.userId, since });
  if (!row) return refused;

  const held = { passkey: row.hasPasskey, totp: row.hasTotp };
  const factors = (['passkey', 'totp'] as const).filter((factor) => held[factor] && isStrategyEnabled(factor));
  if (factors.length === 0) {
    return { steppedUp: !!row.stampedVia || row.signedInRecently, methods: ['email', 'sign_in'], factor: null };
  }

  // Only a factor the user holds counts: an emailed link stands in for a factor only while the user has none.
  const stampedWith = factors.find((candidate) => candidate === row.stampedVia);
  const signedInWith = row.signedInRecently ? factors.find((candidate) => candidate === session.authStrategy) : undefined;
  const factor = stampedWith ?? signedInWith ?? null;
  return { steppedUp: !!factor, methods: factors, factor };
};

/**
 * Refuses an account-security action on a session that does not stand stepped up, an impersonation first of all.
 * @returns The step-up state, with the factor that proves the session.
 * @throws AppError 403 `impersonation_forbidden`, or 403 `step_up_required` with what the user can offer in
 *   `meta.methods`.
 */
export const requireStepUp = async (session: SessionFacts): Promise<StepUpState> => {
  refuseImpersonation(session);

  const state = await readStepUp(session);
  if (!state.steppedUp) throw new AppError(403, 'step_up_required', 'info', { meta: { methods: state.methods } });
  return state;
};
