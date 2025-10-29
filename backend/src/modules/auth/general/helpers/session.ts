import type { z } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { db } from '#/db/db';
import { type AuthStrategy, type SessionModel, type SessionTypes, sessionsTable } from '#/db/schema/sessions';
import { type UserModel, usersTable } from '#/db/schema/users';
import { env } from '#/env';
import { Env, getContextUser } from '#/lib/context';
import { AppError } from '#/lib/errors';
import { deleteAuthCookie, getAuthCookie, setAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { deviceInfo } from '#/modules/auth/general/helpers/device-info';
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
export const setUserSession = async (ctx: Context<Env>, user: UserModel, strategy: AuthStrategy, type: SessionTypes = 'regular'): Promise<void> => {
  if (user.role === 'admin' || type === 'impersonation') {
    const ip = getIp(ctx);
    const allowList = (env.REMOTE_SYSTEM_ACCESS_IP ?? '').split(',');
    const allowAll = allowList.includes('*');

    if (!allowAll && (!ip || !allowList.includes(ip))) throw new AppError({ status: 403, type: 'system_access_forbidden', severity: 'warn' });
  }

  // TODO why is this commented out? // Delete previous session (skip if impersonation)
  // if (type !== 'impersonation') {
  //   const existingSession = deleteAuthCookie(ctx, 'session');

  //   if (existingSession) {
  //     const [existingSessionToken] = existingSession.split('.');

  //     // Remove previous session from DB
  //     await db.delete(sessionsTable).where(eq(sessionsTable.token, existingSessionToken));
  //   }
  // }

  // Get device information
  const device = deviceInfo(ctx);

  // Generate token and store hashed
  const sessionToken = nanoid(40);
  const hashedSessionToken = encodeLowerCased(sessionToken);

  // Calculate expiration
  const timeSpan = type === 'impersonation' ? new TimeSpan(1, 'h') : new TimeSpan(1, 'w');

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
  await db.insert(sessionsTable).values(session);

  const adminUser = getContextUser();
  const cookieContent = `${hashedSessionToken}.${type === 'impersonation' ? adminUser.id : ''}`;

  // Set session cookie with the unhashed version
  await setAuthCookie(ctx, 'session', cookieContent, timeSpan);

  // Exit early if it's impersonation
  if (type === 'impersonation') return;

  // Update user last signIn
  const lastSignInAt = getIsoDate();
  await db.update(usersTable).set({ lastSignInAt }).where(eq(usersTable.id, user.id));
  logEvent('info', 'User signed in', { userId: user.id, strategy });
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
  if (!result) throw new AppError({ status: 401, type: 'no_session', severity: 'warn' });

  const { session } = result;

  // Check if the session has expired and invalidate it if so
  if (isExpiredDate(session.expiresAt)) throw new AppError({ status: 401, type: 'session_expired', severity: 'warn' });

  return result;
};

type ParseSessionCookieOptions = {
  redirectOnError?: string;
  deleteOnError?: boolean;
  deleteAfterAttempt?: boolean;
};

export const getParsedSessionCookie = async (
  ctx: Context<Env>,
  options?: ParseSessionCookieOptions,
): Promise<z.infer<typeof sessionCookieSchema>> => {
  const { redirectOnError, deleteOnError = false, deleteAfterAttempt = false } = options ?? {};
  try {
    // Retrieve session cookie data
    const sessionData = await getAuthCookie(ctx, 'session');

    // If no session data, return null
    if (!sessionData) throw new Error();

    // Parse delimited string: "<hashedSessionToken>.<adminUserId>"
    const [sessionToken, adminUserIdRaw] = sessionData.split('.');
    if (!sessionToken) throw new Error();

    const adminUserId = adminUserIdRaw || undefined;

    return sessionCookieSchema.parse({ sessionToken, adminUserId });
  } catch (error) {
    if (deleteOnError) deleteAuthCookie(ctx, 'session');
    throw new AppError({ status: 401, type: 'unauthorized', severity: 'warn', redirectPath: redirectOnError });
  } finally {
    if (deleteAfterAttempt) deleteAuthCookie(ctx, 'session');
  }
};
