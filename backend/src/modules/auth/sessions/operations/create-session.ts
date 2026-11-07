import type { Context } from 'hono';
import { appConfig } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { enrollDevice } from '#/modules/auth/devices/operations/enroll-device';
import { type NewDevice, notifySignIn } from '#/modules/auth/devices/operations/notify-sign-in';
import { setAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { deviceColumns } from '#/modules/auth/sessions/helpers/device-info';
import { collectSignInContext, type SignInContext } from '#/modules/auth/sessions/helpers/sign-in-context';
import { findSession } from '#/modules/auth/sessions/operations/resolve-session';
import { revokeSessions } from '#/modules/auth/sessions/operations/revoke-sessions';
import type { AuthStrategy, SessionKind, StepUpProof } from '#/modules/auth/sessions/sessions-db';
import { findLiveSessionsHeldByUser, insertSession } from '#/modules/auth/sessions/sessions-queries';
import { stepUpWindow } from '#/modules/auth/step-up/helpers/step-up';
import { findSystemRole } from '#/modules/system/system-queries';
import type { UserModel } from '#/modules/user/user-db';
import { findLastSignInAt, updateLastSignInAt } from '#/modules/user/user-queries';
import { hashDeviceIdForUser, hashIpForUser, hashSubnet } from '#/utils/hash-pii';
import { newHashedToken } from '#/utils/hash-token';
import { toSubnet } from '#/utils/ip-subnet';
import { getIsoDate, isoDateIn } from '#/utils/iso-date';
import { log } from '#/utils/logger';
import { isSystemAccessAllowed } from '#/utils/system-access';
import { TimeSpan } from '#/utils/time-span';

/** Sessions are written on the base pool: tests and scripts create them without a request. */
const dbCtx = { var: { db: baseDb } };

/** How long a session lasts; the cookie that carries it expires with it. */
export const sessionLifetime = new TimeSpan(1, 'w');

/**
 * Revokes the user's oldest live sessions beyond the cap before a sign-in inserts one. Regular and mfa sessions count
 * together, since an mfa session is the full session of a user with MFA on. Concurrent sign-ins may exceed the cap by
 * one.
 */
export const evictExcessSessions = async (userId: string): Promise<void> => {
  const excess = await findLiveSessionsHeldByUser(dbCtx, { userId, offset: appConfig.maxSessionsPerUser - 1 });
  if (excess.length === 0) return;

  const sessionIds = excess.map(({ id }) => id);
  await revokeSessions(dbCtx, { userId, sessionIds, reason: 'session_cap', by: null });
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

    const previousSignInAt = await findLastSignInAt(dbCtx, { userId });

    return { deviceIdHash, previousSignInAt: previousSignInAt ?? null };
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
}

/**
 * Stores a session for the user and returns what its cookies need: the random token, which exists only there, since the
 * row keeps its hash, and for a session that starts stepped up the content of its step-up cookie. `strategy` is the
 * method that started the sign-in; a second factor goes in `steppedUpVia`. Database only, so it runs without a request.
 */
export const createSession = async (
  user: Pick<UserModel, 'id'>,
  context: SignInContext,
  strategy: AuthStrategy,
  kind: SessionKind = 'regular',
  { steppedUpVia = null, steppedUpAt, connectionId = null }: SessionExtras = {},
) => {
  const { rawIp, country, asn, device, deviceId } = context;

  // Pseudonymize network identity. Raw IP is never persisted.
  const subnet = rawIp ? toSubnet(rawIp) : null;

  const { raw: sessionToken, hash: secret } = newHashedToken();
  const stepUp = steppedUpVia ? newHashedToken() : null;

  const sessionId = generateId();
  const now = getIsoDate();
  const session = {
    id: sessionId,
    secret,
    userId: user.id,
    kind,
    ...deviceColumns(device),
    authStrategy: strategy,
    ipHash: rawIp ? hashIpForUser(rawIp, user.id) : null,
    ipSubnetHash: subnet ? hashSubnet(subnet) : null,
    ipCountry: country,
    ipAsn: asn,
    deviceIdHash: hashDeviceIdForUser(deviceId, user.id),
    createdAt: now,
    expiresAt: isoDateIn(sessionLifetime),
    steppedUpAt: steppedUpVia ? (steppedUpAt ?? now) : null,
    steppedUpVia,
    steppedUpSecret: stepUp?.hash ?? null,
    connectionId,
  };

  // A browser holds at most one live session, so repeated sign-ins do not stack up.
  const replaced = await findLiveSessionsHeldByUser(dbCtx, { userId: user.id, deviceIdHash: session.deviceIdHash });
  await revokeSessions(dbCtx, { userId: user.id, sessionIds: replaced.map(({ id }) => id), reason: 'replaced', by: null });
  await evictExcessSessions(user.id);

  await insertSession(dbCtx, { values: session });

  const newDevice = await enrollNewDevice(user.id, deviceId);

  await updateLastSignInAt(dbCtx, { userId: user.id, lastSignInAt: getIsoDate() });

  return { sessionId, sessionToken, stepUpCookie: stepUp?.raw, timeSpan: sessionLifetime, newDevice };
};

/**
 * Signs the user in on this browser: stores a session, sets its cookie and sends the sign-in notices. The session the
 * request presents ends, another account's too; a provider callback arrives cross-site without the Strict cookie.
 */
export const setUserSession = async (
  ctx: Context<Env>,
  user: UserModel,
  strategy: AuthStrategy,
  kind: SessionKind = 'regular',
  extras: SessionExtras = {},
): Promise<void> => {
  const isSystemAdmin = !!(await findSystemRole(dbCtx, { userId: user.id, role: 'admin' }));

  if (isSystemAdmin && !isSystemAccessAllowed(ctx)) throw new AppError(403, 'system_access_forbidden', 'warn');

  const context = await collectSignInContext(ctx);
  const presented = await findSession(ctx);
  const { sessionToken, stepUpCookie, timeSpan, newDevice } = await createSession(user, context, strategy, kind, extras);
  if (presented) {
    await revokeSessions(dbCtx, { userId: presented.session.userId, sessionIds: [presented.session.id], reason: 'replaced', by: null });
  }

  setAuthCookie(ctx, 'session', sessionToken, timeSpan);
  if (stepUpCookie) setAuthCookie(ctx, 'session-step-up', stepUpCookie, stepUpWindow);

  notifySignIn({ user, isSystemAdmin, context, strategy, newDevice });

  log.info('User signed in', { strategy });
};
