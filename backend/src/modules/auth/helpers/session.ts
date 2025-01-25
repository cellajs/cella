import { sha256 } from '@oslojs/crypto/sha2';
import { encodeHexLowerCase } from '@oslojs/encoding';
import { config } from 'config';
import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { deleteCookie, getCookie, getSignedCookie, setCookie, setSignedCookie } from 'hono/cookie';
import type { CookieOptions } from 'hono/utils/cookie';
import { db } from '#/db/db';
import { supportedOauthProviders } from '#/db/schema/oauth-accounts';
import { sessionsTable } from '#/db/schema/sessions';
import { type UserModel, usersTable } from '#/db/schema/users';
import { logEvent } from '#/middlewares/logger/log-event';
import { nanoid } from '#/utils/nanoid';
import { TimeSpan, createDate, isExpiredDate } from '#/utils/time-span';
import { env } from '../../../../env';
import { deviceInfo } from './device-info';

const cookieName = `${config.slug}-session-v1`;
const isProduction = config.mode === 'production';

type SessionType = 'regular' | 'impersonation';

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

// Set user session (sign in user)
export const setUserSession = async (
  ctx: Context,
  userId: UserModel['id'],
  strategy: string | null,
  sessionType: SessionType = 'regular',
  adminUserId?: UserModel['id'],
) => {
  // Get device information
  const device = deviceInfo(ctx);

  // Validate auth strategy
  const authStrategy = sessionType === 'regular' ? validateAuthStrategy(strategy || '') : null;

  // Generate encoded session id
  const sessionId = nanoid(40);
  const hashedSessionId = encodeHexLowerCase(sha256(new TextEncoder().encode(sessionId)));

  const session = {
    id: hashedSessionId,
    userId,
    type: sessionType,
    adminUserId: sessionType === 'impersonation' ? (adminUserId ?? null) : null,
    deviceName: device.name,
    deviceType: device.type,
    deviceOs: device.os,
    browser: device.browser,
    authStrategy,
    createdAt: new Date(),
    expiresAt: createDate(new TimeSpan(1, 'w')), // 1 week from now
  };

  // Insert session
  await db.insert(sessionsTable).values(session);

  // Set cookie
  await setSessionCookie(ctx, cookieName, sessionId, sessionType === 'impersonation');

  // If it's an impersonation session, we only log event
  if (sessionType === 'impersonation') logEvent('Impersonation started', { user: userId, strategy: 'impersonation' });
  else {
    // Update last sign in date
    const lastSignInAt = new Date();
    await db.update(usersTable).set({ lastSignInAt }).where(eq(usersTable.id, userId));
    logEvent('User signed in', { user: userId, strategy });
  }
};

// Set session cookie
export const setSessionCookie = async (ctx: Context, name: string, content: string, singleSession?: boolean) => {
  const options = {
    secure: isProduction, // set `Secure` flag in HTTPS
    path: '/',
    domain: isProduction ? config.domain : undefined,
    httpOnly: true,
    sameSite: isProduction ? 'lax' : 'lax', // Strict is possible once we use a proxy for api
    ...(singleSession ? {} : { maxAge: new TimeSpan(1, 'd').seconds() }), // 1 day, omitted if singleSession is true
  } satisfies CookieOptions;
  isProduction ? await setSignedCookie(ctx, name, content, env.COOKIE_SECRET, options) : setCookie(ctx, name, content, options);
};

// Get session id from cookie
export const getSessionIdFromCookie = async (ctx: Context) => {
  const sessionId = isProduction ? await getSignedCookie(ctx, env.COOKIE_SECRET, cookieName) : getCookie(ctx, cookieName);
  return sessionId;
};

// Delete session cookie
export const deleteSessionCookie = (ctx: Context) => {
  deleteCookie(ctx, cookieName, {
    path: '/',
    secure: isProduction,
    domain: isProduction ? config.domain : undefined,
  });
};

// Validate session and return session & user
export const validateSession = async (sessionId: string) => {
  const hashedSessionId = encodeHexLowerCase(sha256(new TextEncoder().encode(sessionId)));

  const result = await db
    .select({ session: sessionsTable, user: usersTable })
    .from(sessionsTable)
    .where(eq(sessionsTable.id, hashedSessionId))
    .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id));

  const { user, session } = result[0];

  if (isExpiredDate(session.expiresAt)) {
    await invalidateSession(session.id);
    return { session: null, user: null };
  }

  return { session, user };
};

// Invalidate all sessions based on user id
export const invalidateUserSessions = async (userId: UserModel['id']) => {
  await db.delete(sessionsTable).where(eq(sessionsTable.userId, userId));
};

// Invalidate single session with session id
export const invalidateSession = async (id: string) => {
  const hashedSessionId = encodeHexLowerCase(sha256(new TextEncoder().encode(id)));
  await db.delete(sessionsTable).where(eq(sessionsTable.id, hashedSessionId));
};
