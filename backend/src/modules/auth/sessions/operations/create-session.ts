import type { Context } from 'hono';
import { appConfig } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { enrollDevice } from '#/modules/auth/devices/operations/enroll-device';
import { type NewDevice, notifySignIn } from '#/modules/auth/devices/operations/notify-sign-in';
import { deleteAuthCookie, getAuthCookie, setAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { newSessionToken } from '#/modules/auth/sessions/helpers/session-token';
import { collectSignInContext, type SignInContext } from '#/modules/auth/sessions/helpers/sign-in-context';
import { revokeSessions } from '#/modules/auth/sessions/operations/revoke-sessions';
import type { AuthStrategy, SessionTypes, StepUpProof } from '#/modules/auth/sessions/sessions-db';
import { findLiveOwnSessions, insertSession } from '#/modules/auth/sessions/sessions-queries';
import { findSystemRole } from '#/modules/system/system-queries';
import type { UserModel } from '#/modules/user/user-db';
import { findLastSignInAt, upsertLastSignInAt } from '#/modules/user/user-queries';
import { hashDeviceIdForUser, hashIpForUser, hashSubnet } from '#/utils/hash-pii';
import { toSubnet } from '#/utils/ip-subnet';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';
import { isSystemAccessAllowed } from '#/utils/system-access';
import { createDate, TimeSpan } from '#/utils/time-span';

/** Sessions are written on the base pool: tests and scripts create them without a request. */
const dbCtx = { var: { db: baseDb } };

/**
 * Revokes the user's oldest live sessions beyond the cap before a sign-in inserts one. Regular and mfa sessions count
 * together, since an mfa session is the full session of a user with MFA on; impersonation is left alone. Concurrent
 * sign-ins may exceed the cap by one.
 */
export const evictExcessSessions = async (userId: string): Promise<void> => {
  const excess = await findLiveOwnSessions(dbCtx, { userId, offset: appConfig.maxSessionsPerUser - 1 });
  if (excess.length === 0) return;

  const sessionIds = excess.map((s) => s.id);
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

    const counters = await findLastSignInAt(dbCtx, { userId });

    return { deviceIdHash, previousSignInAt: counters?.lastSignInAt ?? null };
  } catch (err) {
    log.error('Failed to enroll device on sign-in', { userId, err });
    return null;
  }
};

/** What a sign-in may record on the session besides its method. */
export interface SessionExtras {
  /** The second factor an MFA completion presented: the session starts stepped up by it. */
  steppedUpVia?: StepUpProof | null;
  /** The connection (an institution's trust) an SSO sign-in came through. */
  connectionId?: string | null;
}

/**
 * Stores a session for the user and returns what its cookie needs: the random token, which exists only there, since the
 * row keeps its hash. `strategy` is the method that started the sign-in; a second factor goes in `steppedUpVia`. An
 * impersonation names the admin session it is layered on. Database only, so it runs without a request.
 */
export const createSession = async (
  user: Pick<UserModel, 'id'>,
  context: SignInContext,
  strategy: AuthStrategy,
  type: SessionTypes = 'regular',
  impersonatorSessionId: string | null = null,
  { steppedUpVia = null, connectionId = null }: SessionExtras = {},
) => {
  const { rawIp, country, asn, device, deviceId } = context;

  // Pseudonymize network identity. Raw IP is never persisted.
  const subnet = rawIp ? toSubnet(rawIp) : null;

  const { token: sessionToken, secret } = newSessionToken();

  const timeSpan = type === 'impersonation' ? new TimeSpan(1, 'h') : new TimeSpan(1, 'w');

  const sessionId = generateId();
  const now = getIsoDate();
  const session = {
    id: sessionId,
    secret,
    userId: user.id,
    type,
    deviceName: device.name,
    deviceType: device.type,
    deviceOs: device.os,
    browser: device.browser,
    authStrategy: strategy,
    ipHash: rawIp ? hashIpForUser(rawIp, user.id) : null,
    ipSubnetHash: subnet ? hashSubnet(subnet) : null,
    ipCountry: country,
    ipAsn: asn,
    deviceIdHash: deviceId ? hashDeviceIdForUser(deviceId, user.id) : null,
    createdAt: now,
    expiresAt: createDate(timeSpan),
    impersonatorSessionId,
    steppedUpAt: steppedUpVia ? now : null,
    steppedUpVia,
    connectionId,
  };

  if (type !== 'impersonation') {
    // A3: a browser holds at most one live session, so repeated sign-ins do not stack up.
    if (session.deviceIdHash) {
      const sessionIds = (await findLiveOwnSessions(dbCtx, { userId: user.id, deviceIdHash: session.deviceIdHash })).map((s) => s.id);
      await revokeSessions(dbCtx, { userId: user.id, sessionIds, reason: 'replaced', by: null });
    }
    await evictExcessSessions(user.id);
  }

  await insertSession(dbCtx, { values: session });

  if (type === 'impersonation') return { sessionId, sessionToken, timeSpan, newDevice: null };

  const newDevice = deviceId ? await enrollNewDevice(user.id, deviceId) : null;

  await upsertLastSignInAt(dbCtx, { userId: user.id, lastSignInAt: getIsoDate() });

  return { sessionId, sessionToken, timeSpan, newDevice };
};

/**
 * Signs the user in on this browser: stores a session, sets its cookie and sends the sign-in notices. An impersonation
 * gets a cookie of its own, layered over the admin's session cookie, which stays: stopping returns the browser to it.
 */
export const setUserSession = async (
  ctx: Context<Env>,
  user: UserModel,
  strategy: AuthStrategy,
  type: SessionTypes = 'regular',
  extras: SessionExtras = {},
): Promise<void> => {
  const isSystemAdmin = !!(await findSystemRole(dbCtx, { userId: user.id, role: 'admin' }));

  if (isSystemAdmin || type === 'impersonation') {
    if (!isSystemAccessAllowed(ctx)) throw new AppError(403, 'system_access_forbidden', 'warn');
  }

  const context = await collectSignInContext(ctx, type);
  const impersonatorSessionId = type === 'impersonation' ? ctx.var.sessionId : null;
  const { sessionToken, timeSpan, newDevice } = await createSession(user, context, strategy, type, impersonatorSessionId, extras);

  if (type === 'impersonation') await setAuthCookie(ctx, 'impersonation', sessionToken, timeSpan);
  else {
    await setAuthCookie(ctx, 'session', sessionToken, timeSpan);
    // A sign-in replaces whatever this browser held, an impersonation included.
    if (await getAuthCookie(ctx, 'impersonation')) deleteAuthCookie(ctx, 'impersonation');
  }

  notifySignIn({ user, isSystemAdmin, context, strategy, newDevice });

  if (type !== 'impersonation') log.info('User signed in', { strategy });
};
