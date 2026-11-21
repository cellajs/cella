import type { Context } from 'hono';
import { embeddedSessionHeader, embeddedSessionParam } from 'shared/utils/embedded-session';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { loadCachedSession } from '#/middlewares/guard/session-cache';
import { deleteAuthCookie, getAuthCookie } from '#/modules/auth/core/general/helpers/cookie';
import type { SessionFacts, SessionModel } from '#/modules/auth/core/sessions/sessions-db';
import { findSessionBySecret } from '#/modules/auth/core/sessions/sessions-queries';
import type { UserWithActivity } from '#/modules/user/helpers/select';
import { hashToken } from '#/utils/hash-token';
import { isExpiredDate } from '#/utils/is-expired-date';

/** Sessions are read on the base pool: every request reads one, and so do processes without the API's context. */
const dbCtx = { var: { db: baseDb } };

/** A live session as a request presents it, with its user. */
export interface ResolvedSession {
  session: SessionFacts;
  /** The hash of the browser key an embedded session counts with; null for an ordinary session. */
  browserKeyHash: string | null;
  user: UserWithActivity;
  /** Holds the admin system role. The rights also need an allowlisted request address, checked per request. */
  hasSystemRole: boolean;
  /** `actors.bindings_version` at this read: the version the user's cached memberships must match. */
  bindingsVersion: string;
}

/** Why a session row no longer backs a request or a stream; null while it is live. */
export const sessionRefusal = ({
  revokedAt,
  expiresAt,
}: Pick<SessionModel, 'revokedAt' | 'expiresAt'>): 'session_revoked' | 'session_expired' | null => {
  if (revokedAt) return 'session_revoked';
  if (isExpiredDate(expiresAt)) return 'session_expired';
  return null;
};

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
    const result = await findSessionBySecret(dbCtx, { secretHash });

    if (!result) throw new AppError(401, 'no_session', 'warn');
    const refusal = sessionRefusal({ revokedAt: result.revokedAt, expiresAt: result.session.expiresAt });
    if (refusal) throw new AppError(401, refusal, 'warn');

    const { session, browserKeyHash, user, systemRole, bindingsVersion } = result;
    return { session, browserKeyHash, user, hasSystemRole: systemRole === 'admin', bindingsVersion };
  });

  if (isExpiredDate(entry.session.expiresAt)) throw new AppError(401, 'session_expired', 'warn');
  return entry;
};

/** A refusal (an `AppError`) reads as no session; anything else, such as a failed read, stays the request's failure. */
const refusalAsNull = (err: unknown): null => {
  if (err instanceof AppError) return null;
  throw err;
};

/** The event stream (`getMyStream`): an EventSource sets no header, so this one route reads the token from its query. */
const isEventStream = (ctx: Context) => ctx.req.method === 'GET' && ctx.req.path.endsWith('/me/stream');

/** The embedded session token a request presents: its header, or the event stream's query; empty while its page holds none. */
const embeddedSessionToken = (ctx: Context) =>
  ctx.req.header(embeddedSessionHeader) ?? (isEventStream(ctx) ? ctx.req.query(embeddedSessionParam) : undefined);

/** Whether a request asks for the embedded session: it carries the token, even an empty one. */
export const asksForEmbeddedSession = (ctx: Context) => embeddedSessionToken(ctx) !== undefined;

/**
 * The embedded session a request presents. Its token names the session, and the browser key in the partitioned cookie
 * must be the one the session recorded at its launch: the token alone, sent from another browser or another platform's
 * site, and the cookie alone, which every frame of the app on the platform's page sends, both read as nothing.
 * @throws AppError 401 without the token or the cookie, for a key the session did not record, and as `readSession`.
 */
const readEmbeddedSession = async (ctx: Context): Promise<ResolvedSession> => {
  const token = embeddedSessionToken(ctx);
  const browserKey = getAuthCookie(ctx, 'embedded-browser-key');
  if (!token || !browserKey) throw new AppError(401, 'unauthorized', 'warn');
  const resolved = await readSession(token);
  if (!resolved.browserKeyHash || resolved.browserKeyHash !== hashToken(browserKey)) throw new AppError(401, 'no_session', 'warn');
  return resolved;
};

interface ResolveSessionOpts {
  /** A refusal also deletes the session cookie; never the browser key, which other frames of the partition count with. */
  clearOnError?: boolean;
  /** Reads the embedded session; by default when the request asks for it (`asksForEmbeddedSession`). */
  embedded?: boolean;
}

/**
 * The session a request presents: the embedded one when it asks for it, else the app's own from its session cookie.
 * Any process serving the app's origin can call it with a raw request context. With `clearOnError`, a refusal of the
 * app's own session also deletes its cookie. A failed read (the database away) keeps it: it holds the only copy of the
 * token.
 * @throws AppError 401 without a session, or for an unknown, revoked or expired token.
 */
export const resolveSession = async (ctx: Context, { clearOnError = false, embedded = asksForEmbeddedSession(ctx) }: ResolveSessionOpts = {}) => {
  if (embedded) return readEmbeddedSession(ctx);
  try {
    const sessionToken = getAuthCookie(ctx, 'session');
    if (!sessionToken) throw new AppError(401, 'unauthorized', 'warn');
    return await readSession(sessionToken);
  } catch (err) {
    if (clearOnError && err instanceof AppError && err.status === 401) deleteAuthCookie(ctx, 'session');
    throw err;
  }
};

/**
 * {@link resolveSession} for a request that may present no session: null on a refusal (no session, or an unknown,
 * expired or revoked token), while a failed read stays the request's failure, so the database being away never reads
 * as signed out.
 */
export const findSession = (ctx: Context, opts?: Pick<ResolveSessionOpts, 'embedded'>): Promise<ResolvedSession | null> =>
  resolveSession(ctx, opts).catch(refusalAsNull);
