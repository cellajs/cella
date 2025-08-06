import type { z } from '@hono/zod-openapi';
import { and, eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { db } from '#/db/db';
import { type AuthStrategy, type SessionModel, sessionsTable } from '#/db/schema/sessions';
import { type UserModel, usersTable } from '#/db/schema/users';
import { env } from '#/env';
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

/**
 * Sets a user session and stores it in the database.
 * Generates a session token, records device information, and optionally associates an admin user for impersonation.
 */
export const setUserSession = async (ctx: Context, user: UserModel, strategy: AuthStrategy, adminUser?: UserModel) => {
  if ((!adminUser && user.role === 'admin') || adminUser) {
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

  const session = {
    token: hashedSessionToken,
    userId: user.id,
    type: adminUser ? ('impersonation' as const) : ('regular' as const),
    deviceName: device.name,
    deviceType: device.type,
    deviceOs: device.os,
    browser: device.browser,
    authStrategy: strategy,
    createdAt: getIsoDate(),
    expiresAt: createDate(new TimeSpan(1, 'w')), // 1 week from now
  };

  // Insert session
  await db.insert(sessionsTable).values(session);

  // Set expiration time span
  const timeSpan = adminUser ? new TimeSpan(1, 'h') : new TimeSpan(1, 'w');

  const cookieContent = `${hashedSessionToken}.${adminUser?.id ?? ''}`;

  // Set session cookie with the unhashed version
  await setAuthCookie(ctx, 'session', cookieContent, timeSpan);

  // If it's an impersonation session, we can stop here
  if (adminUser) return;

  // Update last sign in date
  const lastSignInAt = getIsoDate();
  await db.update(usersTable).set({ lastSignInAt }).where(eq(usersTable.id, user.id));
  logEvent('info', 'User signed in', { user: user.id, strategy });
};

/**
 * Validates a session by checking the provided session token.
 *
 * @param sessionToken - Hashed session token to validate.
 * @returns The session and user data if valid, otherwise null.
 */
export const validateSession = async (hashedSessionToken: string) => {
  const [result] = await db
    .select({ session: sessionsTable, user: userSelect })
    .from(sessionsTable)
    .where(eq(sessionsTable.token, hashedSessionToken))
    .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id));

  // If no result is found, return null session and user
  if (!result) return { session: null, user: null };

  const { session } = result;

  // Check if the session has expired and invalidate it if so
  if (isExpiredDate(session.expiresAt)) {
    await invalidateSessionById(session.id, session.userId);
    return { session: null, user: null };
  }

  return result satisfies { session: SessionModel; user: UserModel };
};

// Invalidate all sessions based on user id
export const invalidateAllUserSessions = async (userId: UserModel['id']) => {
  await db.delete(sessionsTable).where(eq(sessionsTable.userId, userId));
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
