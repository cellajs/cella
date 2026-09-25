import { and, eq, gt, isNull, ne, sql } from 'drizzle-orm';
import { appConfig } from 'shared';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { passkeysTable } from '#/modules/auth/passkeys/passkeys-db';
import { type SessionFacts, type StepUpProof, sessionsTable } from '#/modules/auth/sessions-db';
import { totpsTable } from '#/modules/auth/totps/totps-db';
import { getIsoDate } from '#/utils/iso-date';
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
 * Whether a session stands stepped up now, and what its user can offer when it does not. A user with a passkey or
 * TOTP (for a method the app has on) proves one of them: a step-up with it, or a sign-in with it, within the window.
 * A user without proves a fresh first factor: any sign-in within the window, or a step-up through an emailed link.
 * Read fresh from the database, so a stamp set in another process counts at once; an impersonation never stands.
 */
export const readStepUp = async (session: SessionFacts): Promise<StepUpState> => {
  const refused: StepUpState = { steppedUp: false, methods: [], factor: null };
  if (session.type === 'impersonation') return refused;

  // Compared in SQL: `created_at` is a timestamp without zone, which JavaScript would parse as local time.
  const since = new Date(Date.now() - stepUpWindow.milliseconds()).toISOString();
  const [row] = await baseDb
    .select({
      stampedVia: sql<StepUpProof | null>`case when ${sessionsTable.steppedUpAt} > ${since} then ${sessionsTable.steppedUpVia} end`,
      signedInRecently: sql<boolean>`${sessionsTable.createdAt} > ${since}`,
      hasPasskey: sql<boolean>`exists (select 1 from ${passkeysTable} where ${passkeysTable.userId} = ${sessionsTable.userId})`,
      hasTotp: sql<boolean>`exists (select 1 from ${totpsTable} where ${totpsTable.userId} = ${sessionsTable.userId})`,
    })
    .from(sessionsTable)
    .where(eq(sessionsTable.id, session.id));
  if (!row) return refused;

  const held = { passkey: row.hasPasskey, totp: row.hasTotp };
  const factors = (['passkey', 'totp'] as const).filter(
    (factor) => held[factor] && appConfig.enabledAuthStrategies.includes(factor),
  );
  if (factors.length === 0) {
    return { steppedUp: !!row.stampedVia || row.signedInRecently, methods: ['email', 'sign_in'], factor: null };
  }

  // Only a factor the user holds counts: an emailed link stands in for a factor only while the user has none.
  const stampedWith = factors.find((candidate) => candidate === row.stampedVia);
  const signedInWith = row.signedInRecently
    ? factors.find((candidate) => candidate === session.authStrategy)
    : undefined;
  const factor = stampedWith ?? signedInWith ?? null;
  return { steppedUp: !!factor, methods: factors, factor };
};

/**
 * Refuses an account-security action on a session that does not stand stepped up. An impersonation is always
 * refused: the admin acts as the user, never on how the user's account is protected.
 * @returns The step-up state, with the factor that proves the session.
 * @throws AppError 403 `impersonation_forbidden`, or 403 `step_up_required` with what the user can offer in
 *   `meta.methods`.
 */
export const requireStepUp = async (session: SessionFacts): Promise<StepUpState> => {
  if (session.type === 'impersonation') throw new AppError(403, 'impersonation_forbidden', 'warn');

  const state = await readStepUp(session);
  if (!state.steppedUp) throw new AppError(403, 'step_up_required', 'info', { meta: { methods: state.methods } });
  return state;
};

/**
 * Stamps a live session of the user as stepped up now, by the proof given; only the named session, never an
 * impersonation.
 * @returns Whether a session was stamped: false when it ended or belongs to someone else.
 */
export const stampStepUp = async (sessionId: string, userId: string, via: StepUpProof): Promise<boolean> => {
  const now = getIsoDate();
  const [stamped] = await baseDb
    .update(sessionsTable)
    .set({ steppedUpAt: now, steppedUpVia: via })
    .where(
      and(
        eq(sessionsTable.id, sessionId),
        eq(sessionsTable.userId, userId),
        ne(sessionsTable.type, 'impersonation'),
        isNull(sessionsTable.revokedAt),
        gt(sessionsTable.expiresAt, now),
      ),
    )
    .returning({ id: sessionsTable.id });
  return !!stamped;
};
