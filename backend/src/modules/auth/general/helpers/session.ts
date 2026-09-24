import type { z } from '@hono/zod-openapi';
import { and, desc, eq, gt, inArray, isNull, ne } from 'drizzle-orm';
import type { Context } from 'hono';
import { appConfig } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { nanoid } from 'shared/utils/nanoid';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb as db } from '#/db/db';
import { lookupIp } from '#/lib/geoip';
import { revokeSessions } from '#/modules/auth/auth-queries';
import { deleteAuthCookie, getAuthCookie, setAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { deviceInfo } from '#/modules/auth/general/helpers/device-info';
import { enrollDevice } from '#/modules/auth/general/helpers/enroll-device';
import { type NewDevice, notifySignIn } from '#/modules/auth/general/helpers/notify-sign-in';
import { type AuthStrategy, type SessionModel, type SessionTypes, sessionsTable } from '#/modules/auth/sessions-db';
import { systemRolesTable } from '#/modules/system/system-roles-db';
import { type UserWithCounters, userSelect } from '#/modules/user/helpers/select';
import { userCountersTable } from '#/modules/user/user-counters-db';
import { type UserModel, usersTable } from '#/modules/user/user-db';
import { sessionCookieSchema } from '#/schemas';
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

/**
 * Revokes the user's oldest live sessions beyond the cap before a sign-in inserts one. Regular and mfa sessions count
 * together, since an mfa session is the full session of a user with MFA on; impersonation is left alone. Concurrent
 * sign-ins may exceed the cap by one.
 */
export const evictExcessSessions = async (userId: string): Promise<void> => {
  const excess = await db
    .select({ id: sessionsTable.id })
    .from(sessionsTable)
    .where(
      and(
        eq(sessionsTable.userId, userId),
        ne(sessionsTable.type, 'impersonation'),
        gt(sessionsTable.expiresAt, getIsoDate()),
        isNull(sessionsTable.revokedAt),
      ),
    )
    .orderBy(desc(sessionsTable.createdAt))
    .offset(appConfig.maxSessionsPerUser - 1);

  if (excess.length === 0) return;

  await revokeSessions(
    { var: { db } },
    {
      filters: [
        inArray(
          sessionsTable.id,
          excess.map((s) => s.id),
        ),
      ],
      reason: 'session_cap',
      revokedBy: null,
    },
  );

  log.info('Revoked sessions beyond per-user cap', { userId, count: excess.length });
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

/** Stores a session for the user and returns what the session cookie needs. Database only, so it runs without a request. */
export const createSession = async (
  user: Pick<UserModel, 'id'>,
  context: SignInContext,
  strategy: AuthStrategy,
  type: SessionTypes = 'regular',
) => {
  const { rawIp, country, asn, device, deviceId } = context;

  // Pseudonymize network identity. Raw IP is never persisted.
  const subnet = rawIp ? toSubnet(rawIp) : null;

  // Generate token and store hashed
  const sessionToken = nanoid(40);
  const hashedSessionToken = hashToken(sessionToken);

  const timeSpan = type === 'impersonation' ? new TimeSpan(1, 'h') : new TimeSpan(1, 'w');

  const sessionId = generateId();
  const session = {
    id: sessionId,
    secret: hashedSessionToken,
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
  };

  if (type !== 'impersonation') {
    // A3: a browser holds at most one live session, so repeated sign-ins do not stack up.
    if (session.deviceIdHash) {
      await revokeSessions(
        { var: { db } },
        {
          filters: [
            eq(sessionsTable.userId, user.id),
            eq(sessionsTable.deviceIdHash, session.deviceIdHash),
            ne(sessionsTable.type, 'impersonation'),
            gt(sessionsTable.expiresAt, getIsoDate()),
          ],
          reason: 'replaced',
          revokedBy: null,
        },
      );
    }
    await evictExcessSessions(user.id);
  }

  await db.insert(sessionsTable).values(session);

  if (type === 'impersonation') return { sessionId, hashedSessionToken, timeSpan, newDevice: null };

  const newDevice = deviceId ? await enrollNewDevice(user.id, deviceId) : null;

  // lastSignInAt lives in user_counters to avoid CDC noise on the users table
  const lastSignInAt = getIsoDate();
  await db.insert(userCountersTable).values({ userId: user.id, lastSignInAt }).onConflictDoUpdate({
    target: userCountersTable.userId,
    set: { lastSignInAt },
  });

  return { sessionId, hashedSessionToken, timeSpan, newDevice };
};

/** Signs the user in on this browser: stores a session, sets its cookie and sends the sign-in notices. Impersonation records the admin in the cookie. */
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
  const { sessionId, hashedSessionToken, timeSpan, newDevice } = await createSession(user, context, strategy, type);

  const adminUserIdPart = type === 'impersonation' ? ctx.var.user.id : '';
  const cookieContent = `${hashedSessionToken}.${sessionId}.${adminUserIdPart}`;

  // Set session cookie with the unhashed version
  await setAuthCookie(ctx, 'session', cookieContent, timeSpan);

  notifySignIn({ user, isSystemAdmin, context, strategy, newDevice });

  if (type !== 'impersonation') log.info('User signed in', { strategy });
};

/** Returns the session (secret stripped) and its user; throws when the session is missing, revoked or expired. The sweep removes dead rows. */
export const validateSession = async (
  hashedSessionToken: string,
): Promise<{ session: SessionModel; user: UserWithCounters }> => {
  const [result] = await db
    .select({ session: sessionsTable, user: userSelect })
    .from(sessionsTable)
    .where(eq(sessionsTable.secret, hashedSessionToken))
    .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id));

  if (!result) throw new AppError(401, 'no_session', 'warn');

  const { session, user } = result;

  if (session.revokedAt) throw new AppError(401, 'session_revoked', 'warn');
  if (isExpiredDate(session.expiresAt)) throw new AppError(401, 'session_expired', 'warn');

  const { secret: _, ...safeSession } = session;
  return { session: safeSession, user };
};

type ParseSessionCookieOptions = {
  deleteOnError?: boolean;
  deleteAfterAttempt?: boolean;
};

export const getParsedSessionCookie = async (
  ctx: Context<Env>,
  options?: ParseSessionCookieOptions,
): Promise<z.infer<typeof sessionCookieSchema>> => {
  const { deleteOnError = false, deleteAfterAttempt = false } = options ?? {};
  try {
    const sessionData = await getAuthCookie(ctx, 'session');

    if (!sessionData) throw new Error();

    // Parse delimited string: "<hashedSessionToken>.<sessionId>.<adminUserId>"
    const [sessionToken, sessionId, adminUserIdRaw] = sessionData.split('.');
    if (!sessionToken || !sessionId) throw new Error();

    const adminUserId = adminUserIdRaw || undefined;

    return sessionCookieSchema.parse({ sessionToken, sessionId, adminUserId });
  } catch (error) {
    if (deleteOnError) deleteAuthCookie(ctx, 'session');
    throw new AppError(401, 'unauthorized', 'warn');
  } finally {
    if (deleteAfterAttempt) deleteAuthCookie(ctx, 'session');
  }
};
