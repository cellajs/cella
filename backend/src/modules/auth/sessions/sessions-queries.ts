import { and, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import type { ActorId } from '#/db/utils/ids';
import { actorsTable } from '#/modules/actors/actors-db';
import { heldFactorsSql } from '#/modules/auth/mfa/mfa-queries';
import {
  type InsertSessionModel,
  type SessionKind,
  type SessionRevocationReason,
  type StepUpProof,
  sessionFactColumns,
  sessionSafeColumns,
  sessionsTable,
} from '#/modules/auth/sessions/sessions-db';
import { systemRolesTable } from '#/modules/system/system-roles-db';
import { emailsTable } from '#/modules/user/emails-db';
import { userSelect } from '#/modules/user/helpers/select';
import { usersTable } from '#/modules/user/user-db';
import { getIsoDate } from '#/utils/iso-date';
import { pick } from '#/utils/pick';

/** A session neither revoked nor expired at `now`, an ISO timestamp. */
export const liveSession = (now: string) => and(isNull(sessionsTable.revokedAt), gt(sessionsTable.expiresAt, now));

interface FindLiveSessionsHeldByUserOpts {
  userId: string;
  /** Only the sessions of this browser. */
  deviceIdHash?: string;
  /** Skip this many of the newest. */
  offset?: number;
}

/** The live sessions the user holds, newest first. */
export const findLiveSessionsHeldByUser = async (ctx: DbContext, { userId, deviceIdHash, offset = 0 }: FindLiveSessionsHeldByUserOpts) =>
  ctx.var.db
    .select({ id: sessionsTable.id })
    .from(sessionsTable)
    .where(and(eq(sessionsTable.userId, userId), liveSession(getIsoDate()), deviceIdHash ? eq(sessionsTable.deviceIdHash, deviceIdHash) : undefined))
    .orderBy(desc(sessionsTable.createdAt))
    .offset(offset);

/** The user's sessions newest first, secret stripped: live, expired and revoked ones, until the sweep removes them. */
export const findUserSessions = async (ctx: DbContext, { userId }: { userId: string }) =>
  ctx.var.db.select(sessionSafeColumns).from(sessionsTable).where(eq(sessionsTable.userId, userId)).orderBy(desc(sessionsTable.createdAt));

interface FindSessionBySecretOpts {
  /** The hash of the session token, the only form the database stores. */
  secretHash: string;
}

/**
 * The session a token's hash names, whether revoked or expired, with its user, the user's system role and the version
 * of the user's bindings. Undefined for an unknown hash.
 */
export const findSessionBySecret = async (ctx: DbContext, { secretHash }: FindSessionBySecretOpts) => {
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
    .where(eq(sessionsTable.secretHash, secretHash))
    .limit(1);
  return result;
};

/** What decides whether these sessions still back a stream: user, revocation and expiry. */
export const findSessionStates = async (ctx: DbContext, { ids }: { ids: string[] }) =>
  ctx.var.db
    .select(pick(sessionsTable, ['id', 'userId', 'revokedAt', 'revocationReason', 'expiresAt']))
    .from(sessionsTable)
    .where(inArray(sessionsTable.id, ids));

/** The session when it is still live, neither revoked nor expired; undefined otherwise. */
export const findLiveSession = async (ctx: DbContext, { id }: { id: string }) => {
  const [live] = await ctx.var.db
    .select({ id: sessionsTable.id })
    .from(sessionsTable)
    .where(and(eq(sessionsTable.id, id), liveSession(getIsoDate())))
    .limit(1);
  return live;
};

/** Stores a session; its `secretHash` is the hash of the session token, never the token. */
export const insertSession = async (ctx: DbContext, { values }: { values: InsertSessionModel }) => {
  await ctx.var.db.insert(sessionsTable).values(values);
};

interface UpdateSessionsRevokedOpts {
  /** Which of the user's sessions: optionally only these ids or this kind. */
  match: { userId: string; ids?: string[]; kind?: SessionKind };
  revokedBy: ActorId | null;
  revocationReason: SessionRevocationReason;
}

/**
 * Stamps the matched sessions that are still live as revoked now; one already revoked or expired keeps its state.
 * @returns The stamped sessions, secret stripped.
 */
export const updateSessionsRevoked = async (ctx: DbContext, { match, revokedBy, revocationReason }: UpdateSessionsRevokedOpts) => {
  const matched = and(
    eq(sessionsTable.userId, match.userId),
    match.ids ? inArray(sessionsTable.id, match.ids) : undefined,
    match.kind ? eq(sessionsTable.kind, match.kind) : undefined,
  );

  const now = getIsoDate();
  return ctx.var.db
    .update(sessionsTable)
    .set({ revokedAt: now, revokedBy, revocationReason })
    .where(and(liveSession(now), matched))
    .returning(sessionSafeColumns);
};

interface GetStepUpFactsOpts {
  sessionId: string;
  userId: string;
  /** Start of the step-up window, an ISO timestamp. */
  since: string;
  /** The hash of the step-up cookie the request presents; undefined without one. */
  presentedSecret?: string;
}

/**
 * What a session's step-up state is decided from, in one query: the proof it was stamped with inside the window, whether
 * it signed in inside the window, which second factors its user holds and whether MFA is on. Undefined when the session
 * row is gone. A stamp counts only with the step-up cookie it went out with, so a copy of the session cookie made before
 * the proof stays unproven; a sign-in counts without it, since no copy of a session cookie predates its sign-in.
 */
export const getStepUpFacts = async (ctx: DbContext, { sessionId, userId, since, presentedSecret }: GetStepUpFactsOpts) => {
  // The factors are looked up by the session's user id as a parameter: a select field renders its columns without their
  // table, so a `sessions` column in these subqueries would name the subquery's own `user_id`.
  const held = heldFactorsSql(userId);
  const stampHeld = presentedSecret ? eq(sessionsTable.steppedUpSecretHash, presentedSecret) : sql`false`;
  const [row] = await ctx.var.db
    .select({
      stampedVia: sql<StepUpProof | null>`case when ${sessionsTable.steppedUpAt} > ${since} and ${stampHeld} then ${sessionsTable.steppedUpVia} end`,
      signedInRecently: sql<boolean>`${sessionsTable.createdAt} > ${since}`,
      hasPasskey: held.passkey,
      hasTotp: held.totp,
      mfaRequired: sql<boolean>`exists (select 1 from ${usersTable} where ${usersTable.id} = ${userId} and ${usersTable.mfaRequired})`,
      hasProvenEmail: sql<boolean>`exists (select 1 from ${emailsTable} where ${emailsTable.userId} = ${userId})`,
    })
    .from(sessionsTable)
    .where(eq(sessionsTable.id, sessionId));
  return row;
};

interface UpdateSessionSteppedUpOpts {
  id: string;
  userId: string;
  via: StepUpProof;
  /** The hash of the step-up cookie the stamp goes out with. */
  secretHash: string;
}

/**
 * Stamps a live session of the user as stepped up now, by the proof given; only the named session. Undefined when the
 * session ended or belongs to someone else.
 */
export const updateSessionSteppedUp = async (ctx: DbContext, { id, userId, via, secretHash }: UpdateSessionSteppedUpOpts) => {
  const now = getIsoDate();
  const [stamped] = await ctx.var.db
    .update(sessionsTable)
    .set({ steppedUpAt: now, steppedUpVia: via, steppedUpSecretHash: secretHash })
    .where(and(eq(sessionsTable.id, id), eq(sessionsTable.userId, userId), liveSession(now)))
    .returning({ id: sessionsTable.id });
  return stamped;
};
