import { db } from '#/db/db';
import { type AuthStrategy, type SessionModel, type SessionTypes, sessionsTable } from '#/db/schema/sessions';
import { type UserModel, usersTable } from '#/db/schema/users';
import { env } from '#/env';
import { getContextUser } from '#/lib/context';
import { AppError } from '#/lib/errors';
import { deleteAuthCookie, getAuthCookie, setAuthCookie } from '#/modules/auth/helpers/cookie';
import { deviceInfo } from '#/modules/auth/helpers/device-info';
import { userSelect } from '#/modules/users/helpers/select';
import { getIp } from '#/utils/get-ip';
import { isExpiredDate } from '#/utils/is-expired-date';
import { getIsoDate } from '#/utils/iso-date';
import { logEvent } from '#/utils/logger';
import { nanoid } from '#/utils/nanoid';
import { encodeLowerCased } from '#/utils/oslo';
import { sessionCookieSchema } from '#/utils/schema/session-cookie';
import { createDate, TimeSpan } from '#/utils/time-span';
import type { z } from '@hono/zod-openapi';
import { and, eq } from 'drizzle-orm';
import type { Context } from 'hono';

/**
 * Sets a user session and stores it in the database.
 * Generates a session token, records device information, and optionally associates an admin user for impersonation.
 */
export const setUserSession = async (ctx: Context, user: UserModel, strategy: AuthStrategy, type: SessionTypes = 'regular'): Promise<string> => {
  if (user.role === 'admin' || type === 'impersonation') {
    const ip = getIp(ctx);
    const allowList = (env.REMOTE_SYSTEM_ACCESS_IP ?? '').split(',');
    const allowAll = allowList.includes('*');

    if (!allowAll && (!ip || !allowList.includes(ip))) throw new AppError({ status: 403, type: 'system_access_forbidden', severity: 'warn' });
  }

  // Get device information
  const device = deviceInfo(ctx);

  // Generate session token and store the hashed version in db
  const sessionToken = nanoid(40);
  const hashedSessionToken = encodeLowerCased(sessionToken);

  // Calculate expiration
  const timeSpan =
    type === 'impersonation'
      ? new TimeSpan(1, 'h')
      : type === 'regular'
        ? new TimeSpan(1, 'w') // default regular
        : new TimeSpan(10, 'm'); // first step of 2fa

  const session = {
    token: hashedSessionToken,
    userId: user.id,
    type,
    deviceName: device.name,
    deviceType: device.type,
    deviceOs: device.os,
    browser: device.browser,
    authStrategy: strategy,
    createdAt: getIsoDate(),
    expiresAt: createDate(timeSpan),
  };

  // Insert session
  const [{ token: insertedToken }] = await db.insert(sessionsTable).values(session).returning({ token: sessionsTable.token });

  if (type !== 'pending_2fa') {
    const adminUser = getContextUser();
    const cookieContent = `${hashedSessionToken}.${type === 'impersonation' ? adminUser.id : ''}`;

    // Set session cookie with the unhashed version
    await setAuthCookie(ctx, 'session', cookieContent, timeSpan);
  }

  // Update last sign in date
  if (type === 'regular' || type === 'two_factor_authentication') {
    const lastSignInAt = getIsoDate();
    await db.update(usersTable).set({ lastSignInAt }).where(eq(usersTable.id, user.id));
    logEvent('info', 'User signed in', { userId: user.id, strategy });
  }

  return insertedToken;
};

/**
 * Validates a session by checking the provided session token.
 *
 * @param sessionToken - Hashed session token to validate.
 * @returns The session and user data if valid, otherwise null.
 */
export const validateSession = async (hashedSessionToken: string): Promise<{ session: SessionModel; user: UserModel }> => {
  const [result] = await db
    .select({ session: sessionsTable, user: userSelect })
    .from(sessionsTable)
    .where(eq(sessionsTable.token, hashedSessionToken))
    .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id));

  // If no result is found throw no session
  if (!result) throw new AppError({ status: 401, type: 'no_session', severity: 'info' });

  const { session } = result;

  // Check if the session has expired and invalidate it if so
  if (isExpiredDate(session.expiresAt)) {
    await invalidateSessionById(session.id, session.userId);
    throw new AppError({ status: 401, type: 'session_expired', severity: 'warn', isRedirect: true });
  }

  await db.update(sessionsTable).set({ consumedAt: new Date() });
  return result;
};

// Invalidate single session with session id
export const invalidateSessionById = async (id: string, userId: string) => {
  await db.delete(sessionsTable).where(and(eq(sessionsTable.id, id), eq(sessionsTable.userId, userId)));
};

export const getParsedSessionCookie = async (ctx: Context, deleteAfterAttempt = false): Promise<z.infer<typeof sessionCookieSchema> | null> => {
  try {
    // Retrieve session cookie data
    const sessionData = await getAuthCookie(ctx, 'session');

    // If no session data, return null
    if (!sessionData) return null;

    // Parse delimited string: "<hashedSessionToken>.<adminUserId>"
    const [sessionToken, adminUserIdRaw] = sessionData.split('.');
    if (!sessionToken) return null;

    const adminUserId = adminUserIdRaw || undefined;

    return sessionCookieSchema.parse({ sessionToken, adminUserId });
  } catch (error) {
    return null;
  } finally {
    if (deleteAfterAttempt) deleteAuthCookie(ctx, 'session');
  }
};
