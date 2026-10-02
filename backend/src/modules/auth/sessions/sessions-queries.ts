import { and, desc, eq, gt, inArray, isNull, ne, sql } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import type { ActorId } from '#/db/utils/ids';
import { actorsTable } from '#/modules/actors/actors-db';
import { passkeysTable } from '#/modules/auth/passkeys/passkeys-db';
import {
  type InsertSessionModel,
  type SessionRevocationReason,
  type SessionTypes,
  type StepUpProof,
  sessionFactColumns,
  sessionSafeColumns,
  sessionsTable,
} from '#/modules/auth/sessions/sessions-db';
import { totpsTable } from '#/modules/auth/totps/totps-db';
import { systemRolesTable } from '#/modules/system/system-roles-db';
import { userSelect } from '#/modules/user/helpers/select';
import { usersTable } from '#/modules/user/user-db';
import { getIsoDate } from '#/utils/iso-date';

interface FindLiveOwnSessionsOpts {
  userId: string;
  /** Only the sessions of this browser. */
  deviceIdHash?: string;
  /** Skip this many of the newest. */
  offset?: number;
}

/** The user's live sessions that are not impersonations, newest first. */
export const findLiveOwnSessions = async (ctx: DbContext, { userId, deviceIdHash, offset = 0 }: FindLiveOwnSessionsOpts) => {
  return ctx.var.db
    .select({ id: sessionsTable.id })
    .from(sessionsTable)
    .where(
      and(
        eq(sessionsTable.userId, userId),
        ne(sessionsTable.type, 'impersonation'),
        gt(sessionsTable.expiresAt, getIsoDate()),
        isNull(sessionsTable.revokedAt),
        deviceIdHash ? eq(sessionsTable.deviceIdHash, deviceIdHash) : undefined,
      ),
    )
    .orderBy(desc(sessionsTable.createdAt))
    .offset(offset);
};

interface FindSessionBySecretOpts {
  /** The hash of the session token, the only form the database stores. */
  secret: string;
}

/**
 * The session a token's hash names, whether revoked or expired, with its user, the user's system role and the version
 * of the user's bindings. Undefined for an unknown hash.
 */
export const findSessionBySecret = async (ctx: DbContext, { secret }: FindSessionBySecretOpts) => {
  const [result] = await ctx.var.db
    .select({
      session: sessionFactColumns,
      revokedAt: sessionsTable.revokedAt,
      user: userSelect,
      systemRole: systemRolesTable.role,
      bindingsVersion: actorsTable.bindingsVersion,
    })
    .from(sessionsTable)
    .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
    .innerJoin(actorsTable, eq(actorsTable.id, usersTable.id))
    .leftJoin(systemRolesTable, eq(systemRolesTable.userId, usersTable.id))
    .where(eq(sessionsTable.secret, secret))
    .limit(1);
  return result;
};

interface FindSessionByIdOpts {
  id: string;
}

/** The user a session belongs to, whatever its state; undefined once the row is gone. */
export const findSessionById = async (ctx: DbContext, { id }: FindSessionByIdOpts) => {
  const [session] = await ctx.var.db.select({ userId: sessionsTable.userId }).from(sessionsTable).where(eq(sessionsTable.id, id));
  return session;
};

interface InsertSessionOpts {
  values: InsertSessionModel;
}

export const insertSession = async (ctx: DbContext, { values }: InsertSessionOpts) => {
  await ctx.var.db.insert(sessionsTable).values(values);
};

interface UpdateSessionsRevokedOpts {
  /** Which sessions: the user's, optionally only these ids or this type, or the impersonations layered on these sessions. */
  match: { userId: string; ids?: string[]; type?: SessionTypes } | { impersonatorSessionIds: string[] };
  revokedBy: ActorId | null;
  revocationReason: SessionRevocationReason;
}

/**
 * Stamps the matched sessions that are still live as revoked now; one already revoked or expired keeps its state.
 * @returns The stamped sessions, secret stripped.
 */
export const updateSessionsRevoked = async (ctx: DbContext, { match, revokedBy, revocationReason }: UpdateSessionsRevokedOpts) => {
  const matched =
    'userId' in match
      ? and(
          eq(sessionsTable.userId, match.userId),
          match.ids ? inArray(sessionsTable.id, match.ids) : undefined,
          match.type ? eq(sessionsTable.type, match.type) : undefined,
        )
      : inArray(sessionsTable.impersonatorSessionId, match.impersonatorSessionIds);

  return ctx.var.db
    .update(sessionsTable)
    .set({ revokedAt: getIsoDate(), revokedBy, revocationReason })
    .where(and(isNull(sessionsTable.revokedAt), gt(sessionsTable.expiresAt, getIsoDate()), matched))
    .returning(sessionSafeColumns);
};

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
