import type { z } from '@hono/zod-openapi';
import { and, eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { db } from '#/db/db';
import { type AuthStrategy, type SessionModel, type SessionTypes, sessionsTable } from '#/db/schema/sessions';
import { systemRolesTable } from '#/db/schema/system-roles';
import { type UserModel, usersTable } from '#/db/schema/users';
import { env } from '#/env';
import type { Env } from '#/lib/context';
import { AppError } from '#/lib/error';
import { deleteAuthCookie, getAuthCookie, setAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { deviceInfo } from '#/modules/auth/general/helpers/device-info';
import { type UserWithActivity, userSelect } from '#/modules/user/helpers/select';
import { sessionCookieSchema } from '#/schemas';
import { getIp } from '#/utils/get-ip';
import { isExpiredDate } from '#/utils/is-expired-date';
import { getIsoDate } from '#/utils/iso-date';
import { logEvent } from '#/utils/logger';
import { nanoid } from '#/utils/nanoid';
import { encodeLowerCased } from '#/utils/oslo';
import { createDate, TimeSpan } from '#/utils/time-span';

/**
 * Sets a user session and stores it in the database.
 * Generates a session token, records device information, and optionally associates an admin user for impersonation.
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
    const ip = getIp(ctx);
    const allowList = (env.REMOTE_SYSTEM_ACCESS_IP ?? '').split(',');
    const allowAll = allowList.includes('*');

    if (!allowAll && (!ip || !allowList.includes(ip))) throw new AppError(403, 'system_access_forbidden', 'warn');
  }

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

  const adminUser = ctx.var.user;
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
 * @returns The session (without token) and user data if valid, otherwise null.
 */
export const validateSession = async (
  hashedSessionToken: string,
): Promise<{ session: SessionModel; user: UserWithActivity }> => {
  const [result] = await db
    .select({ session: sessionsTable, user: userSelect })
    .from(sessionsTable)
    .where(eq(sessionsTable.token, hashedSessionToken))
    .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id));

  // If no result is found throw no session
  if (!result) throw new AppError(401, 'no_session', 'warn');

  const { session, user } = result;

  // Check if the session has expired and invalidate it if so
  if (isExpiredDate(session.expiresAt)) throw new AppError(401, 'session_expired', 'warn');

  // Strip token from session before returning
  const { token: _, ...safeSession } = session;
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

    // Parse delimited string: "<hashedSessionToken>.<adminUserId>"
    const [sessionToken, adminUserIdRaw] = sessionData.split('.');
    if (!sessionToken) throw new Error();

    const adminUserId = adminUserIdRaw || undefined;

    return sessionCookieSchema.parse({ sessionToken, adminUserId });
  } catch (error) {
    if (deleteOnError) deleteAuthCookie(ctx, 'session');
    throw new AppError(401, 'unauthorized', 'warn');
  } finally {
    if (deleteAfterAttempt) deleteAuthCookie(ctx, 'session');
  }
};
