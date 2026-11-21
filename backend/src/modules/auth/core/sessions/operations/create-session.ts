import type { Context } from 'hono';
import { appConfig } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { deviceColumns } from '#/lib/device-info';
import { enrollDevice } from '#/modules/auth/core/devices/operations/enroll-device';
import { type NewDevice, notifySignIn } from '#/modules/auth/core/devices/operations/notify-sign-in';
import { getAuthCookie, setAuthCookie } from '#/modules/auth/core/general/helpers/cookie';
import { collectSignInContext, type SignInContext } from '#/modules/auth/core/sessions/helpers/sign-in-context';
import { findSession } from '#/modules/auth/core/sessions/operations/resolve-session';
import { revokeSessions } from '#/modules/auth/core/sessions/operations/revoke-sessions';
import type { SessionKind } from '#/modules/auth/core/sessions/sessions-db';
import { findLiveSessionsHeldByUser, insertSession, updateSessionHandoff } from '#/modules/auth/core/sessions/sessions-queries';
import { stepUpWindow } from '#/modules/auth/core/step-up/helpers/step-up';
import type { AuthStrategy, StepUpProof } from '#/modules/auth/core/strategies';
import { findSystemRole } from '#/modules/system/system-queries';
import type { UserModel } from '#/modules/user/user-db';
import { findLastSignInAt, updateLastSignInAt } from '#/modules/user/user-queries';
import { hashDeviceIdForUser, hashIpForUser, hashSubnet } from '#/utils/hash-pii';
import { hashToken, newHashedToken } from '#/utils/hash-token';
import { toSubnet } from '#/utils/ip-subnet';
import { getIsoDate, isoDateIn } from '#/utils/iso-date';
import { log } from '#/utils/logger';
import { isSystemAccessAllowed } from '#/utils/system-access';
import { TimeSpan } from '#/utils/time-span';

/** Sessions are written on the base pool: tests and scripts create them without a request. */
const dbCtx = { var: { db: baseDb } };

/** How long a session lasts; the cookie that carries it expires with it. */
export const sessionLifetime = new TimeSpan(1, 'w');

/** How long a finished launch's handoff stays redeemable: the embedded page loads and redeems it at once. */
const handoffWindow = new TimeSpan(2, 'm');

/** What an embedded session's `secretHash` holds until its handoff is redeemed: no hash of a token, so no token reads it. */
const handoffSecretHash = (handoffCode: string) => `handoff:${hashToken(handoffCode)}`;

/**
 * Revokes the user's oldest live sessions of one kind beyond the cap before a sign-in inserts one: embedded sessions
 * never push out an ordinary one. Regular and mfa sessions count together, since an mfa session is the full session of
 * a user with MFA on. Concurrent sign-ins may exceed the cap by one.
 */
export const revokeExcessSessions = async (userId: string, { embedded = false }: { embedded?: boolean } = {}): Promise<void> => {
  const excess = await findLiveSessionsHeldByUser(dbCtx, { userId, embedded, offset: appConfig.maxSessionsPerUser - 1 });
  if (excess.length === 0) return;

  await revokeSessions(dbCtx, { userId, sessionIds: excess.map(({ id }) => id), reason: 'session_cap', by: null });
};

/**
 * Enrolls the browser and, when the user has not signed in from it before, returns its hash with the sign-in that preceded this
 * one (null for a brand-new account). Must run before lastSignInAt is overwritten. A failure here never fails the sign-in, but it
 * is loud: without enrollment no new sign-in notice ever goes out.
 */
const enrollNewDevice = async (userId: string, deviceId: string): Promise<NewDevice | null> => {
  try {
    const { deviceIdHash, isNew } = await enrollDevice(userId, deviceId);
    if (!isNew) return null;
    const previousSignInAt = (await findLastSignInAt(dbCtx, { userId })) ?? null;
    return { deviceIdHash, previousSignInAt };
  } catch (err) {
    log.error('Failed to enroll device on sign-in', { userId, err });
    return null;
  }
};

/** What a sign-in may record on the session besides its method. */
export interface SessionExtras {
  /** The second factor an MFA completion presented, or `sso` for an institution's asserted MFA: the session starts stepped up by it. */
  steppedUpVia?: StepUpProof | null;
  /** When that proof was made, an ISO timestamp; default now. An institution's MFA dates from its authentication. */
  steppedUpAt?: string;
  /** The connection (an institution's trust) an SSO sign-in came through. */
  connectionId?: string | null;
  /** When the session ends, within `sessionLifetime`: a demo session ends with its tenant. */
  expiresAt?: string;
  /** The browser key of the partition an embedded session lives in, which the session then counts only beside. */
  browserKey?: string;
}

/**
 * Stores a session for the user and returns what its cookies need: the random token, which exists only there, since the
 * row keeps its hash, and for a session that starts stepped up the content of its step-up cookie. `strategy` is the
 * method that started the sign-in; a second factor goes in `steppedUpVia`. Database only, so it runs without a request.
 * With a `browserKey` the session is embedded, and the token is a handoff code: the session lives `handoffWindow` until
 * the frame redeems it for a token of its own (`redeemEmbeddedHandoff`).
 */
export const createSession = async (
  user: Pick<UserModel, 'id'>,
  context: SignInContext,
  strategy: AuthStrategy,
  kind: SessionKind = 'regular',
  { steppedUpVia = null, steppedUpAt, connectionId = null, expiresAt: endsAt, browserKey }: SessionExtras = {},
) => {
  const { rawIp, regionCode, asn, device, deviceId } = context;

  // Pseudonymize network identity. Raw IP is never persisted.
  const subnet = rawIp ? toSubnet(rawIp) : null;

  const { raw: sessionToken, hash: secretHash } = newHashedToken();
  const stepUp = steppedUpVia ? newHashedToken() : null;

  const sessionId = generateId();
  const now = getIsoDate();
  const lifetimeEnd = isoDateIn(sessionLifetime);
  const signInEnd = endsAt && endsAt < lifetimeEnd ? endsAt : lifetimeEnd;
  const expiresAt = browserKey ? isoDateIn(handoffWindow) : signInEnd;
  const timeSpan = new TimeSpan(Date.parse(expiresAt) - Date.now(), 'ms');
  const browserKeyHash = browserKey ? hashToken(browserKey) : null;
  const session = {
    id: sessionId,
    secretHash: browserKey ? handoffSecretHash(sessionToken) : secretHash,
    userId: user.id,
    kind,
    ...deviceColumns(device),
    authStrategy: strategy,
    ipHash: rawIp ? hashIpForUser(rawIp, user.id) : null,
    ipSubnetHash: subnet ? hashSubnet(subnet) : null,
    ipRegionCode: regionCode,
    ipAsn: asn,
    deviceIdHash: hashDeviceIdForUser(deviceId, user.id),
    browserKeyHash,
    createdAt: now,
    expiresAt,
    steppedUpAt: steppedUpVia ? (steppedUpAt ?? now) : null,
    steppedUpVia,
    steppedUpSecretHash: stepUp?.hash ?? null,
    connectionId,
  };

  // Repeated sign-ins do not stack up: a browser holds at most one live ordinary session. A launch replaces none, as
  // its token lives in one frame's memory and every other frame of the person on the device keeps its own.
  if (!browserKeyHash) {
    const replaced = await findLiveSessionsHeldByUser(dbCtx, { userId: user.id, embedded: false, deviceIdHash: session.deviceIdHash });
    await revokeSessions(dbCtx, { userId: user.id, sessionIds: replaced.map(({ id }) => id), reason: 'replaced', by: null });
  }
  await revokeExcessSessions(user.id, { embedded: !!browserKeyHash });

  await insertSession(dbCtx, { values: session });

  const newDevice = await enrollNewDevice(user.id, deviceId);

  await updateLastSignInAt(dbCtx, { userId: user.id, lastSignInAt: getIsoDate() });

  return { sessionId, sessionToken, stepUpCookie: stepUp?.raw, timeSpan, newDevice };
};

interface StartSessionOpts {
  strategy: AuthStrategy;
  kind: SessionKind;
  extras: SessionExtras;
}

/** Stores a session after the system admin's address check and sends the sign-in notices; returns what `createSession` returns. */
const startSession = async (ctx: Context<Env>, user: UserModel, { strategy, kind, extras }: StartSessionOpts) => {
  const isSystemAdmin = !!(await findSystemRole(dbCtx, { userId: user.id, role: 'admin' }));

  if (isSystemAdmin && !isSystemAccessAllowed(ctx)) throw new AppError(403, 'system_access_forbidden', 'warn');

  const context = await collectSignInContext(ctx);
  const created = await createSession(user, context, strategy, kind, extras);

  notifySignIn({ user, isSystemAdmin, context, strategy, newDevice: created.newDevice });

  log.info('User signed in', { strategy });
  return created;
};

/**
 * Signs the user in on this browser: stores a session, sets its cookie and sends the sign-in notices. The session the
 * request presents in that cookie ends, another account's too; a provider callback arrives cross-site without the
 * Strict cookie. An embedded session stays as it is.
 */
export const setUserSession = async (
  ctx: Context<Env>,
  user: UserModel,
  strategy: AuthStrategy,
  kind: SessionKind = 'regular',
  extras: SessionExtras = {},
) => {
  const presented = await findSession(ctx, { embedded: false });
  const { sessionToken, stepUpCookie, timeSpan } = await startSession(ctx, user, { strategy, kind, extras });
  if (presented) {
    await revokeSessions(dbCtx, { userId: presented.session.userId, sessionIds: [presented.session.id], reason: 'replaced', by: null });
  }

  setAuthCookie(ctx, 'session', sessionToken, timeSpan);
  if (stepUpCookie) setAuthCookie(ctx, 'session-step-up', stepUpCookie, stepUpWindow);
};

/**
 * Starts an embedded session for the user after an LTI launch, with the connection recorded, and returns its one-use
 * handoff code. The browser key of this partition is kept, or set at its first launch, and outlives each session it
 * binds. It starts stepped up for nothing and no MFA challenge: the launch is the proof. No other session ends.
 */
export const setEmbeddedSession = async (ctx: Context<Env>, user: UserModel, { connectionId }: { connectionId: string }) => {
  const browserKey = getAuthCookie(ctx, 'embedded-browser-key') ?? newHashedToken().raw;
  const { sessionToken: handoffCode } = await startSession(ctx, user, { strategy: 'lti', kind: 'regular', extras: { connectionId, browserKey } });
  setAuthCookie(ctx, 'embedded-browser-key', browserKey, sessionLifetime);
  return handoffCode;
};

/**
 * Redeems the handoff code of an embedded session for its token, which the frame keeps in memory: the code works once,
 * within `handoffWindow`, and only beside the browser key the launch recorded.
 * @throws AppError 401 `no_session` without the browser key, or for a code no live session holds for it.
 */
export const redeemEmbeddedHandoff = async (ctx: Context<Env>, handoffCode: string) => {
  const browserKey = getAuthCookie(ctx, 'embedded-browser-key');
  if (!browserKey) throw new AppError(401, 'no_session', 'warn');
  const { raw: sessionToken, hash: secretHash } = newHashedToken();
  const redeemed = await updateSessionHandoff(dbCtx, {
    handoffSecretHash: handoffSecretHash(handoffCode),
    browserKeyHash: hashToken(browserKey),
    secretHash,
    expiresAt: isoDateIn(sessionLifetime),
  });
  if (!redeemed) throw new AppError(401, 'no_session', 'warn');
  return sessionToken;
};
