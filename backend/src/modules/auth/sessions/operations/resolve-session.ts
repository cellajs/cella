import type { Context } from 'hono';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { loadCachedSession } from '#/middlewares/guard/session-cache';
import { deleteAuthCookie, getAuthCookie } from '#/modules/auth/general/helpers/cookie';
import type { SessionFacts } from '#/modules/auth/sessions/sessions-db';
import { findSessionBySecret } from '#/modules/auth/sessions/sessions-queries';
import type { UserWithActivity } from '#/modules/user/helpers/select';
import { hashToken } from '#/utils/hash-token';
import { isExpiredDate } from '#/utils/is-expired-date';

/** Sessions are read on the base pool: every request reads one, and so do processes without the API's context. */
const dbCtx = { var: { db: baseDb } };

/** A live session as a request presents it, with its user. */
export interface ResolvedSession {
  session: SessionFacts;
  user: UserWithActivity;
  /** Holds the admin system role. The rights also need an allowlisted request address, checked per request. */
  hasSystemRole: boolean;
  /** `actors.bindings_version` at this read: the version the user's cached memberships must match. */
  bindingsVersion: string;
}

/**
 * The live session a cookie's token names, with its user, whether the user holds the admin system role and the
 * version of the user's bindings: from the session cache (`session-cache.ts`), keyed by the token's hash, or else read
 * by that hash, the only form the database stores. Requests presenting the token while that read runs share it, and a
 * refusal is never cached. A cached entry stops at the session's expiry.
 * @throws AppError 401 `no_session` for an unknown token, `session_revoked` or `session_expired`.
 * @public
 */
export const readSession = async (sessionToken: string): Promise<ResolvedSession> => {
  const secretHash = hashToken(sessionToken);
  const entry = await loadCachedSession(secretHash, async () => {
    const result = await findSessionBySecret(dbCtx, { secret: secretHash });

    if (!result) throw new AppError(401, 'no_session', 'warn');
    if (result.revokedAt) throw new AppError(401, 'session_revoked', 'warn');
    if (isExpiredDate(result.session.expiresAt)) throw new AppError(401, 'session_expired', 'warn');

    const { session, user, systemRole, bindingsVersion } = result;
    return { session, user, hasSystemRole: systemRole === 'admin', bindingsVersion };
  });

  if (isExpiredDate(entry.session.expiresAt)) throw new AppError(401, 'session_expired', 'warn');
  return entry;
};

/** A refusal (an `AppError`) reads as no session; anything else, such as a failed read, stays the request's failure. */
const refusalAsNull = (err: unknown): null => {
  if (err instanceof AppError) return null;
  throw err;
};

/**
 * The browser's session, from the token in its session cookie.
 * @throws AppError 401 without a token, or for an unknown, revoked or expired one.
 */
export const readBrowserSession = async (sessionToken: string | undefined): Promise<ResolvedSession> => {
  if (!sessionToken) throw new AppError(401, 'unauthorized', 'warn');
  return readSession(sessionToken);
};

/**
 * The app session a request presents, read from its session cookie only, so any process serving the app's origin can
 * call it with a raw request context. With `clearOnError`, a refusal also deletes the cookie: it holds the only copy of
 * the token, so a failed read (the database away) keeps it.
 * @throws AppError 401 without a session cookie, or for an unknown, revoked or expired token.
 */
export const resolveSession = async (ctx: Context, { clearOnError = false }: { clearOnError?: boolean } = {}): Promise<ResolvedSession> => {
  try {
    return await readBrowserSession(getAuthCookie(ctx, 'session'));
  } catch (err) {
    if (clearOnError && err instanceof AppError && err.status === 401) deleteAuthCookie(ctx, 'session');
    throw err;
  }
};

/**
 * {@link resolveSession} for a request that may present no session: null on a refusal (no cookie, or an unknown,
 * expired or revoked token), while a failed read stays the request's failure, so the database being away never reads
 * as signed out.
 */
export const findSession = (ctx: Context): Promise<ResolvedSession | null> => resolveSession(ctx).catch(refusalAsNull);
