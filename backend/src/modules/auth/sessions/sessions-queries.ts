import { and, eq, gt, isNull, ne, sql } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import { passkeysTable } from '#/modules/auth/passkeys/passkeys-db';
import { type StepUpProof, sessionsTable } from '#/modules/auth/sessions-db';
import { totpsTable } from '#/modules/auth/totps/totps-db';
import { getIsoDate } from '#/utils/iso-date';

interface GetStepUpFactsOpts {
  sessionId: string;
  userId: string;
  /** Start of the step-up window, an ISO timestamp. */
  since: string;
}

/**
 * What a session's step-up state is decided from, in one query: the proof it was stamped with inside the window, whether
 * it signed in inside the window, and which second factors its user holds. Undefined when the session row is gone.
 */
export const getStepUpFacts = async (ctx: DbContext, { sessionId, userId, since }: GetStepUpFactsOpts) => {
  // Compared in SQL: `created_at` is a timestamp without zone, which JavaScript would parse as local time.
  // The factors are looked up by the session's user id as a parameter: a select field renders its columns without their
  // table, so a `sessions` column in these subqueries would name the subquery's own `user_id`.
  const [row] = await ctx.var.db
    .select({
      stampedVia: sql<StepUpProof | null>`case when ${sessionsTable.steppedUpAt} > ${since} then ${sessionsTable.steppedUpVia} end`,
      signedInRecently: sql<boolean>`${sessionsTable.createdAt} > ${since}`,
      hasPasskey: sql<boolean>`exists (select 1 from ${passkeysTable} where ${passkeysTable.userId} = ${userId})`,
      hasTotp: sql<boolean>`exists (select 1 from ${totpsTable} where ${totpsTable.userId} = ${userId})`,
    })
    .from(sessionsTable)
    .where(eq(sessionsTable.id, sessionId));
  return row;
};

interface UpdateSessionSteppedUpOpts {
  id: string;
  userId: string;
  via: StepUpProof;
}

/**
 * Stamps a live session of the user as stepped up now, by the proof given; only the named session, never an
 * impersonation. Undefined when the session ended or belongs to someone else.
 */
export const updateSessionSteppedUp = async (ctx: DbContext, { id, userId, via }: UpdateSessionSteppedUpOpts) => {
  const now = getIsoDate();
  const [stamped] = await ctx.var.db
    .update(sessionsTable)
    .set({ steppedUpAt: now, steppedUpVia: via })
    .where(
      and(
        eq(sessionsTable.id, id),
        eq(sessionsTable.userId, userId),
        ne(sessionsTable.type, 'impersonation'),
        isNull(sessionsTable.revokedAt),
        gt(sessionsTable.expiresAt, now),
      ),
    )
    .returning({ id: sessionsTable.id });
  return stamped;
};
