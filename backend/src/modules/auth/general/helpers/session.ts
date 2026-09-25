import { and, desc, eq, gt, isNull, ne } from 'drizzle-orm';
import type { Context } from 'hono';
import { appConfig } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { nanoid } from 'shared/utils/nanoid';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb as db } from '#/db/db';
import { lookupIp } from '#/lib/geoip';
import { getSessionCache, type SessionCacheEntry, setSessionCache } from '#/middlewares/guard/auth-cache';
import { deleteAuthCookie, getAuthCookie, setAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { deviceInfo } from '#/modules/auth/general/helpers/device-info';
import { endSessions } from '#/modules/auth/general/helpers/end-sessions';
import { enrollDevice } from '#/modules/auth/general/helpers/enroll-device';
import { type NewDevice, notifySignIn } from '#/modules/auth/general/helpers/notify-sign-in';
import { type AuthStrategy, type SessionTypes, sessionFactColumns, sessionsTable } from '#/modules/auth/sessions-db';
import { systemRolesTable } from '#/modules/system/system-roles-db';
import { userSelect } from '#/modules/user/helpers/select';
import { userCountersTable } from '#/modules/user/user-counters-db';
import { type UserModel, usersTable } from '#/modules/user/user-db';
import { getIp } from '#/utils/get-ip';
import { hashDeviceIdForUser, hashIpForUser, hashSubnet } from '#/utils/hash-pii';
import { hashToken } from '#/utils/hash-token';
import { toSubnet } from '#/utils/ip-subnet';
import { isExpiredDate } from '#/utils/is-expired-date';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';
import { isSystemAccessAllowed } from '#/utils/system-access';
import { createDate, TimeSpan } from '#/utils/time-span';

/** Chrome caps cookie lifetime at 400 days; the device id slides forward on every sign-in. */
const DEVICE_ID_LIFESPAN = new TimeSpan(400, 'd');

/** Get or mint the opaque per-browser device id: set only on successful sign-in and refreshed each sign-in, so active devices never expire. */
const ensureDeviceId = async (ctx: Context<Env>): Promise<string> => {
  const existing = await getAuthCookie(ctx, 'device-id');
  const deviceId = existing || nanoid(24);
  await setAuthCookie(ctx, 'device-id', deviceId, DEVICE_ID_LIFESPAN);
  return deviceId;
};

/** The user's live sessions that are not impersonations, newest first, optionally only those of one browser. */
const liveOwnSessions = (userId: string, deviceIdHash?: string) =>
  db
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
    .orderBy(desc(sessionsTable.createdAt));

/**
 * Revokes the user's oldest live sessions beyond the cap before a sign-in inserts one. Regular and mfa sessions count
 * together, since an mfa session is the full session of a user with MFA on; impersonation is left alone. Concurrent
 * sign-ins may exceed the cap by one.
 */
export const evictExcessSessions = async (userId: string): Promise<void> => {
  const excess = await liveOwnSessions(userId).offset(appConfig.maxSessionsPerUser - 1);
  if (excess.length === 0) return;

  const sessionIds = excess.map((s) => s.id);
  await endSessions({ var: { db } }, { userId, sessionIds, reason: 'session_cap', by: null });
};

/** What the sign-in request says about the browser and the network. Raw IP and device id stay in memory; only their hashes are stored. */
export type SignInContext = {
  rawIp: string | null;
  country: string | null;
  asn: number | null;
  device: ReturnType<typeof deviceInfo>;
  /** Null for impersonation: the browser belongs to the admin. */
  deviceId: string | null;
};

/** The only part of session creation that reads the request. Mints or refreshes the device id cookie as a side effect. */
export const collectSignInContext = async (ctx: Context<Env>, type: SessionTypes): Promise<SignInContext> => {
  const rawIp = getIp(ctx);
  const { country, asn } = await lookupIp(rawIp);
  const deviceId = type === 'impersonation' ? null : await ensureDeviceId(ctx);

  return { rawIp, country, asn, device: deviceInfo(ctx), deviceId };
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

    const [counters] = await db
      .select({ lastSignInAt: userCountersTable.lastSignInAt })
      .from(userCountersTable)
      .where(eq(userCountersTable.userId, userId));

    return { deviceIdHash, previousSignInAt: counters?.lastSignInAt ?? null };
  } catch (err) {
    log.error('Failed to enroll device on sign-in', { userId, err });
    return null;
  }
};

/**
 * Stores a session for the user and returns what its cookie needs: the random token, which exists only there, since the
 * row keeps its hash. An impersonation names the admin session it is layered on. Database only, so it runs without a
 * request.
 */
export const createSession = async (
  user: Pick<UserModel, 'id'>,
  context: SignInContext,
  strategy: AuthStrategy,
  type: SessionTypes = 'regular',
  impersonatorSessionId: string | null = null,
) => {
  const { rawIp, country, asn, device, deviceId } = context;

  // Pseudonymize network identity. Raw IP is never persisted.
  const subnet = rawIp ? toSubnet(rawIp) : null;

  const sessionToken = nanoid(40);

  const timeSpan = type === 'impersonation' ? new TimeSpan(1, 'h') : new TimeSpan(1, 'w');

  const sessionId = generateId();
  const session = {
    id: sessionId,
    secret: hashToken(sessionToken),
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
    createdAt: getIsoDate(),
    expiresAt: createDate(timeSpan),
    impersonatorSessionId,
  };

  if (type !== 'impersonation') {
    // A3: a browser holds at most one live session, so repeated sign-ins do not stack up.
    if (session.deviceIdHash) {
      const sessionIds = (await liveOwnSessions(user.id, session.deviceIdHash)).map((s) => s.id);
      await endSessions({ var: { db } }, { userId: user.id, sessionIds, reason: 'replaced', by: null });
    }
    await evictExcessSessions(user.id);
  }

  await db.insert(sessionsTable).values(session);

  if (type === 'impersonation') return { sessionId, sessionToken, timeSpan, newDevice: null };

  const newDevice = deviceId ? await enrollNewDevice(user.id, deviceId) : null;

  // lastSignInAt lives in user_counters to avoid CDC noise on the users table
  const lastSignInAt = getIsoDate();
  await db.insert(userCountersTable).values({ userId: user.id, lastSignInAt }).onConflictDoUpdate({
    target: userCountersTable.userId,
    set: { lastSignInAt },
  });

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
): Promise<void> => {
  const isSystemAdmin = await db
    .select()
    .from(systemRolesTable)
    .where(and(eq(systemRolesTable.userId, user.id), eq(systemRolesTable.role, 'admin')))
    .limit(1)
    .then((rows) => !!rows[0]);

  if (isSystemAdmin || type === 'impersonation') {
    if (!isSystemAccessAllowed(ctx)) throw new AppError(403, 'system_access_forbidden', 'warn');
  }

  const context = await collectSignInContext(ctx, type);
  const impersonatorSessionId = type === 'impersonation' ? ctx.var.sessionId : null;
  const { sessionToken, timeSpan, newDevice } = await createSession(
    user,
    context,
    strategy,
    type,
    impersonatorSessionId,
  );

  if (type === 'impersonation') await setAuthCookie(ctx, 'impersonation', sessionToken, timeSpan);
  else {
    await setAuthCookie(ctx, 'session', sessionToken, timeSpan);
    // A sign-in replaces whatever this browser held, an impersonation included.
    if (await getAuthCookie(ctx, 'impersonation')) deleteAuthCookie(ctx, 'impersonation');
  }

  notifySignIn({ user, isSystemAdmin, context, strategy, newDevice });

  if (type !== 'impersonation') log.info('User signed in', { strategy });
};

/**
 * The live session a cookie's token names, with its user and whether the user holds the admin system role: from the
 * auth cache, keyed by the token's hash, or else from the database, which stores only that hash. A cached entry
 * answers only to the token itself and stops at the session's expiry; endings drop it through `endSessions`.
 * @throws AppError 401 `no_session` for an unknown token, `session_revoked` or `session_expired`.
 */
export const readSession = async (sessionToken: string): Promise<SessionCacheEntry> => {
  const secretHash = hashToken(sessionToken);

  const cached = getSessionCache(secretHash);
  if (cached) {
    if (isExpiredDate(cached.session.expiresAt)) throw new AppError(401, 'session_expired', 'warn');
    return cached;
  }

  // The role is read whatever the address, so the cached entry is right for every request that hits it.
  const [result] = await db
    .select({
      session: sessionFactColumns,
      revokedAt: sessionsTable.revokedAt,
      user: userSelect,
      systemRole: systemRolesTable.role,
    })
    .from(sessionsTable)
    .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
    .leftJoin(systemRolesTable, eq(systemRolesTable.userId, usersTable.id))
    .where(eq(sessionsTable.secret, secretHash))
    .limit(1);

  if (!result) throw new AppError(401, 'no_session', 'warn');
  if (result.revokedAt) throw new AppError(401, 'session_revoked', 'warn');
  if (isExpiredDate(result.session.expiresAt)) throw new AppError(401, 'session_expired', 'warn');

  const entry = { session: result.session, user: result.user, hasSystemRole: result.systemRole === 'admin' };
  setSessionCache(secretHash, entry);
  return entry;
};

/**
 * The app session a request presents, read from its cookies only, so any process serving the app's origin can call it
 * with a raw request context. An impersonation counts only on top of the admin session that started it, held by this
 * same browser; without an impersonation cookie it is the browser's own session, which is never an impersonation. With
 * `clearOnError`, a refusal also deletes the cookie that failed.
 * @throws AppError 401 without a session cookie, for an unknown, revoked or expired token, or an impersonation that
 *   this browser's own session does not back.
 */
export const resolveSession = async (
  ctx: Context,
  { clearOnError = false }: { clearOnError?: boolean } = {},
): Promise<SessionCacheEntry> => {
  const sessionToken = await getAuthCookie(ctx, 'session');
  const impersonationToken = await getAuthCookie(ctx, 'impersonation');

  const clearIfRefused = async (cookie: 'session' | 'impersonation', read: () => Promise<SessionCacheEntry>) => {
    try {
      return await read();
    } catch (err) {
      if (clearOnError) deleteAuthCookie(ctx, cookie);
      throw err;
    }
  };

  if (impersonationToken) {
    return clearIfRefused('impersonation', async () => {
      const impersonation = await readSession(impersonationToken);
      const admin = sessionToken ? await readSession(sessionToken).catch(() => null) : null;
      const { type, impersonatorSessionId } = impersonation.session;
      if (type !== 'impersonation' || !admin || admin.session.id !== impersonatorSessionId) {
        throw new AppError(401, 'unauthorized', 'warn');
      }
      return impersonation;
    });
  }

  return clearIfRefused('session', async () => {
    if (!sessionToken) throw new AppError(401, 'unauthorized', 'warn');
    const entry = await readSession(sessionToken);
    if (entry.session.type === 'impersonation') throw new AppError(401, 'unauthorized', 'warn');
    return entry;
  });
};
