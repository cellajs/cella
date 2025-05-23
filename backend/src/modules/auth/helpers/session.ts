import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import type { z } from 'zod';
import { db } from '#/db/db';
import { supportedOauthProviders } from '#/db/schema/oauth-accounts';
import { type SessionModel, sessionsTable } from '#/db/schema/sessions';
import { type UserModel, usersTable } from '#/db/schema/users';
import { logEvent } from '#/middlewares/logger/log-event';
import { userSelect } from '#/modules/users/helpers/select';
import { isExpiredDate } from '#/utils/is-expired-date';
import { getIsoDate } from '#/utils/iso-date';
import { nanoid } from '#/utils/nanoid';
import { encodeLowerCased } from '#/utils/oslo';
import { sessionCookieSchema } from '#/utils/schema/session-cookie';
import { TimeSpan, createDate } from '#/utils/time-span';
import { deleteAuthCookie, getAuthCookie, setAuthCookie } from './cookie';
import { deviceInfo } from './device-info';

// The authentication strategies supported by cella
export const supportedAuthStrategies = ['oauth', 'password', 'passkey'] as const;

// Type guard to check if strategy is supported
const isAuthStrategy = (strategy: string): strategy is (typeof allSupportedStrategies)[number] => {
  const [, ...elseStrategies] = supportedAuthStrategies;
  const allSupportedStrategies = [...supportedOauthProviders, ...elseStrategies];
  return (allSupportedStrategies as string[]).includes(strategy);
};

// Validate auth strategy
const validateAuthStrategy = (strategy: string) => (isAuthStrategy(strategy) ? strategy : null);

/**
 * Sets a user session and stores it in the database.
 * Generates a session token, records device information, and optionally associates an admin user for impersonation.
 *
 * @param ctx - Request/response context.
 * @param userId - ID of the user being signed in.
 * @param strategy - The authentication strategy `'impersonation' | 'regular'`.
 * @param adminUserId - Optional , id of the admin user if the session is an impersonation.
 */
export const setUserSession = async (ctx: Context, userId: UserModel['id'], strategy: string, adminUserId?: UserModel['id']) => {
  // Get device information
  const device = deviceInfo(ctx);

  // Validate auth strategy
  const authStrategy = strategy === 'impersonation' ? null : validateAuthStrategy(strategy);

  // Generate session token and store the hashed version in db
  const sessionToken = nanoid(40);
  const hashedSessionToken = encodeLowerCased(sessionToken);

  const session = {
    token: hashedSessionToken,
    userId,
    type: strategy === 'impersonation' ? ('impersonation' as const) : ('regular' as const),
    deviceName: device.name,
    deviceType: device.type,
    deviceOs: device.os,
    browser: device.browser,
    authStrategy,
    createdAt: getIsoDate(),
    expiresAt: createDate(new TimeSpan(1, 'w')), // 1 week from now
  };

  // Insert session
  await db.insert(sessionsTable).values(session);

  // Set expiration time span
  const timeSpan = strategy === 'impersonation' ? new TimeSpan(1, 'h') : new TimeSpan(1, 'w');

  const cookieContent = `${hashedSessionToken}.${adminUserId ?? ''}`;

  // Set session cookie with the unhashed version
  await setAuthCookie(ctx, 'session', cookieContent, timeSpan);

  // If it's an impersonation session, we can stop here
  if (strategy === 'impersonation') return;

  // Update last sign in date
  const lastSignInAt = getIsoDate();
  await db.update(usersTable).set({ lastSignInAt }).where(eq(usersTable.id, userId));
  logEvent('User signed in', { user: userId, strategy });
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
    await invalidateSessionById(session.id);
    return { session: null, user: null };
  }

  return result satisfies { session: SessionModel; user: UserModel };
};

// Invalidate all sessions based on user id
export const invalidateUserSessions = async (userId: UserModel['id']) => {
  await db.delete(sessionsTable).where(eq(sessionsTable.userId, userId));
};

// Invalidate single session with session id
export const invalidateSessionById = async (id: string) => {
  await db.delete(sessionsTable).where(eq(sessionsTable.id, id));
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
