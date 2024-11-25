import { config } from 'config';
import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { setCookie as baseSetCookie } from 'hono/cookie';
import type { User } from 'lucia';
import { db } from '#/db/db';
import { auth } from '#/db/lucia';
import { supportedOauthProviders } from '#/db/schema/oauth-accounts';
import { usersTable } from '#/db/schema/users';
import { logEvent } from '#/middlewares/logger/log-event';
import { deviceInfo } from './device-info';

// Cookie session is a regular or impersonation session
type SessionType = 'regular' | 'impersonation';

// The authentication strategies supported by cella
export const supportedAuthStrategies = ['oauth', 'password', 'passkey'] as const;

const isProduction = config.mode === 'production';

// Type guard to check if strategy is supported
const isAuthStrategy = (strategy: string): strategy is (typeof allSupportedStrategies)[number] => {
  const [, ...elseStrategies] = supportedAuthStrategies;
  const allSupportedStrategies = [...supportedOauthProviders, ...elseStrategies];

  return (allSupportedStrategies as string[]).includes(strategy);
};

// Validate auth strategy
const validateAuthStrategy = (strategy: string) => (isAuthStrategy(strategy) ? strategy : null);

export const setCookie = (ctx: Context, name: string, value: string, singleSession?: boolean) =>
  baseSetCookie(ctx, name, value, {
    secure: isProduction, // set `Secure` flag in HTTPS
    path: '/',
    domain: isProduction ? config.domain : undefined,
    httpOnly: true,
    sameSite: isProduction ? 'lax' : 'lax', // Strict is possible if we use a proxy for api
    ...(singleSession ? {} : { maxAge: 60 * 10 }), // 10 min, omitted if singleSession is true
  });

export const setSessionCookie = async (
  ctx: Context,
  userId: User['id'],
  strategy: string | null,
  sessionType: SessionType = 'regular',
  adminUserId?: User['id'],
) => {
  // Get device information
  const device = deviceInfo(ctx);

  // Validate auth strategy
  const authStrategy = sessionType === 'regular' ? validateAuthStrategy(strategy || '') : null;

  const session = await auth.createSession(userId, {
    type: sessionType,
    adminUserId: sessionType === 'impersonation' ? (adminUserId ?? null) : null,
    deviceName: device.name,
    deviceType: device.type,
    deviceOs: device.os,
    browser: device.browser,
    authStrategy,
    createdAt: new Date(),
  });

  const sessionCookie = auth.createSessionCookie(session.id);

  // If it's a regular session, we need to update the user's last sign
  if (sessionType === 'regular') {
    const lastSignInAt = new Date();
    await db.update(usersTable).set({ lastSignInAt }).where(eq(usersTable.id, userId));
    logEvent('User signed in', { user: userId, strategy: strategy });

    // If it's an impersonation session, we only need to log the event
  } else {
    logEvent('Impersonation started', { user: userId, strategy: 'impersonation' });
  }

  ctx.header('Set-Cookie', sessionCookie.serialize());
};

export const removeSessionCookie = (ctx: Context) => {
  const sessionCookie = auth.createBlankSessionCookie();
  ctx.header('Set-Cookie', sessionCookie.serialize());
};
