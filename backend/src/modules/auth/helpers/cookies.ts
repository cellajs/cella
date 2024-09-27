import { config } from 'config';
import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { setCookie as baseSetCookie } from 'hono/cookie';
import type { User } from 'lucia';
import uaParser from 'ua-parser-js';
import { db } from '#/db/db';
import { auth } from '#/db/lucia';
import { supportedOauthProviders } from '#/db/schema/oauth-accounts';
import { usersTable } from '#/db/schema/users';
import { logEvent } from '#/middlewares/logger/log-event';

// The authentication strategies supported by cella
export const supportedAuthStrategies = ['oauth', 'password', 'passkey'] as const;

const isProduction = config.mode === 'production';

const getDevice = (ctx: Context) => {
  const parsedUserAgent = uaParser(ctx.req.header('User-Agent'));
  const name =
    parsedUserAgent.device.model && parsedUserAgent.device.vendor
      ? `${parsedUserAgent.device.vendor} ${parsedUserAgent.device.model}`
      : parsedUserAgent.device.model || parsedUserAgent.device.vendor || null;
  const type: 'desktop' | 'mobile' =
    parsedUserAgent.device.type && ['wearable', 'mobile'].includes(parsedUserAgent.device.type) ? 'mobile' : 'desktop';
  const os =
    parsedUserAgent.os.name && parsedUserAgent.os.version
      ? `${parsedUserAgent.os.name} ${parsedUserAgent.os.version}`
      : parsedUserAgent.os.name || null;
  const browser =
    parsedUserAgent.browser.name && parsedUserAgent.browser.version
      ? `${parsedUserAgent.browser.name} ${parsedUserAgent.browser.version}`
      : parsedUserAgent.browser.name || null;

  return { name, type, os, browser };
};

const isAuthStrategy = (strategy: string): strategy is (typeof allSupportedStrategies)[number] => {
  const [, ...elseStrategies] = supportedAuthStrategies; // Destructure to exclude 'oauth'
  const allSupportedStrategies = [...supportedOauthProviders, ...elseStrategies];

  // Check if strategy is supported
  return (allSupportedStrategies as string[]).includes(strategy);
};
const getAuthStrategy = (strategy: string) => (isAuthStrategy(strategy) ? strategy : null);

export const setCookie = (ctx: Context, name: string, value: string) =>
  baseSetCookie(ctx, name, value, {
    secure: isProduction, // set `Secure` flag in HTTPS
    path: '/',
    domain: isProduction ? config.domain : undefined,
    httpOnly: true,
    sameSite: isProduction ? 'lax' : 'lax',
    maxAge: 60 * 10, // 10 min
  });

export const setSessionCookie = async (ctx: Context, userId: User['id'], strategy: string) => {
  const device = getDevice(ctx);
  const authStrategy = getAuthStrategy(strategy);

  const session = await auth.createSession(userId, {
    type: 'regular',
    adminUserId: null,
    deviceName: device.name,
    deviceType: device.type,
    deviceOs: device.os,
    browser: device.browser,
    authStrategy,
    createdAt: new Date(),
  });
  const sessionCookie = auth.createSessionCookie(session.id);

  const lastSignInAt = new Date();
  await db.update(usersTable).set({ lastSignInAt }).where(eq(usersTable.id, userId));

  logEvent('User signed in', { user: userId, strategy: strategy });

  ctx.header('Set-Cookie', sessionCookie.serialize());
};

export const setImpersonationSessionCookie = async (ctx: Context, userId: User['id'], adminUserId: User['id']) => {
  const device = getDevice(ctx);

  const session = await auth.createSession(userId, {
    type: 'impersonation',
    adminUserId,
    deviceName: device.name,
    deviceType: device.type,
    deviceOs: device.os,
    browser: device.browser,
    authStrategy: null,
    createdAt: new Date(),
  });
  const sessionCookie = auth.createSessionCookie(session.id);

  logEvent('Admin impersonation signed in', { user: userId, strategy: 'impersonation' });

  ctx.header('Set-Cookie', sessionCookie.serialize());
};

export const removeSessionCookie = (ctx: Context) => {
  const sessionCookie = auth.createBlankSessionCookie();
  ctx.header('Set-Cookie', sessionCookie.serialize());
};
