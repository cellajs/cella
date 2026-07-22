import type { z } from '@hono/zod-openapi';
import { and, desc, eq, gt, or } from 'drizzle-orm';
import type { Context } from 'hono';
import { appConfig } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { nanoid } from 'shared/utils/nanoid';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb as db } from '#/db/db';
import { lookupIp } from '#/lib/geoip';
import { deleteAuthCookie, getAuthCookie, setAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { deviceInfo } from '#/modules/auth/general/helpers/device-info';
import { sendAccountSecurityEmail } from '#/modules/auth/general/helpers/send-account-security-email';
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

/**
 * Get or mint the opaque per-browser device id. Set only on successful sign-in (never for anonymous
 * visitors) and refreshed each sign-in so active devices never expire.
 */
const ensureDeviceId = async (ctx: Context<Env>): Promise<string> => {
  const existing = await getAuthCookie(ctx, 'device-id');
  const deviceId = existing || nanoid(24);
  await setAuthCookie(ctx, 'device-id', deviceId, DEVICE_ID_LIFESPAN);
  return deviceId;
};

/**
 * Evicts oldest active regular sessions before inserting one, leaving MFA and impersonation alone.
 * Selecting both partition-key columns before deletion lets PostgreSQL prune the target partition.
 * Concurrent sign-ins may transiently exceed the cap by one.
 */
export const evictExcessSessions = async (userId: string): Promise<void> => {
  const excess = await db
    .select({ id: sessionsTable.id, expiresAt: sessionsTable.expiresAt })
    .from(sessionsTable)
    .where(
      and(
        eq(sessionsTable.userId, userId),
        eq(sessionsTable.type, 'regular'),
        gt(sessionsTable.expiresAt, getIsoDate()),
      ),
    )
    .orderBy(desc(sessionsTable.createdAt))
    .offset(appConfig.maxSessionsPerUser - 1);

  if (excess.length === 0) return;

  await db
    .delete(sessionsTable)
    .where(or(...excess.map((s) => and(eq(sessionsTable.id, s.id), eq(sessionsTable.expiresAt, s.expiresAt)))));

  log.info('Evicted sessions beyond per-user cap', { userId, count: excess.length });
};

/**
 * Sets a user session and stores it in the database.
 * Generates a session token, captures device information, and optionally associates an admin user for impersonation.
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

  // Notify security email when a system admin signs in (skip in development)
  if (isSystemAdmin && appConfig.mode !== 'development') {
    const ip = getIp(ctx) ?? 'unknown';
    sendAccountSecurityEmail({ email: appConfig.securityEmail, name: 'Security' }, 'sysadmin-signin', {
      email: user.email,
      ip,
      timestamp: new Date().toISOString(),
    });
  }

  // Pseudonymize network identity. Raw IP is never persisted.
  const rawIp = getIp(ctx);
  const subnet = rawIp ? toSubnet(rawIp) : null;
  const { country, asn } = await lookupIp(rawIp);

  // Get device information
  const device = deviceInfo(ctx);

  // Generate token and store hashed
  const sessionToken = nanoid(40);
  const hashedSessionToken = hashToken(sessionToken);

  // Calculate expiration
  const timeSpan = type === 'impersonation' ? new TimeSpan(1, 'h') : new TimeSpan(1, 'w');

  // Mint/refresh the long-lived per-browser device id (regular sign-ins only) and derive its
  // per-user HMAC. mfa/impersonation sessions get no device id.
  const deviceId = type === 'regular' ? await ensureDeviceId(ctx) : null;

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

  if (type === 'regular') {
    // A3: a browser holds at most one live session, so repeated sign-ins do not stack up.
    if (session.deviceIdHash) {
      await db
        .delete(sessionsTable)
        .where(
          and(
            eq(sessionsTable.userId, user.id),
            eq(sessionsTable.deviceIdHash, session.deviceIdHash),
            eq(sessionsTable.type, 'regular'),
            gt(sessionsTable.expiresAt, getIsoDate()),
          ),
        );
    }
    // Bound total concurrent regular sessions (evict oldest beyond the cap).
    await evictExcessSessions(user.id);
  }

  // Insert session
  await db.insert(sessionsTable).values(session);

  const adminUser = ctx.var.user;
  const adminUserIdPart = type === 'impersonation' ? adminUser.id : '';
  const cookieContent = `${hashedSessionToken}.${sessionId}.${adminUserIdPart}`;

  // Set session cookie with the unhashed version
  await setAuthCookie(ctx, 'session', cookieContent, timeSpan);

  // Exit early if it's impersonation
  if (type === 'impersonation') return;

  // Update user last signIn in user_counters table (avoids CDC noise on users table)
  const lastSignInAt = getIsoDate();
  await db.insert(userCountersTable).values({ userId: user.id, lastSignInAt }).onConflictDoUpdate({
    target: userCountersTable.userId,
    set: { lastSignInAt },
  });
  log.info('User signed in', { strategy });
};

/**
 * Validates a session by checking the provided session token.
 *
 * @param sessionToken - Hashed session token to validate.
 * @returns The session (without token) and user data if valid, otherwise null.
 */
export const validateSession = async (
  hashedSessionToken: string,
): Promise<{ session: SessionModel; user: UserWithCounters }> => {
  const [result] = await db
    .select({ session: sessionsTable, user: userSelect })
    .from(sessionsTable)
    .where(eq(sessionsTable.secret, hashedSessionToken))
    .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id));

  // If no result is found throw no session
  if (!result) throw new AppError(401, 'no_session', 'warn');

  const { session, user } = result;

  // Check if the session has expired and invalidate it if so
  if (isExpiredDate(session.expiresAt)) {
    // Opportunistically purge the dead row so expired sessions don't linger between maintenance
    // runs. Fire-and-forget: a failure here must never change the auth outcome. Scoping by
    // expiresAt lets PostgreSQL target the right partition directly.
    void db
      .delete(sessionsTable)
      .where(and(eq(sessionsTable.id, session.id), eq(sessionsTable.expiresAt, session.expiresAt)))
      .catch(() => {});
    throw new AppError(401, 'session_expired', 'warn');
  }

  // Strip secret from session before returning
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
    // Retrieve session cookie data
    const sessionData = await getAuthCookie(ctx, 'session');

    // If no session data, return null
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
