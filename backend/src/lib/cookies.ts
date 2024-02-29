import { config } from 'config';
import { Context } from 'hono';
import { setCookie as baseSetCookie } from 'hono/cookie';
import { User } from 'lucia';
import { auth } from '../db/lucia';
import { customLogger } from './custom-logger';

export const setCookie = (ctx: Context, name: string, value: string) =>
  baseSetCookie(ctx, name, value, {
    secure: config.mode === 'production', // set `Secure` flag in HTTPS
    path: '/',
    httpOnly: true,
    maxAge: 60 * 10, // 10 min
  });

export const setSessionCookie = async (ctx: Context, userId: User['id'], strategy: string) => {
  const session = await auth.createSession(userId, {});
  const sessionCookie = auth.createSessionCookie(session.id);

  customLogger('User signed in', { user: userId, strategy: strategy });

  ctx.header('Set-Cookie', sessionCookie.serialize());
};

export const removeSessionCookie = (ctx: Context) => {
  customLogger('User not authenticated');

  const sessionCookie = auth.createBlankSessionCookie();
  ctx.header('Set-Cookie', sessionCookie.serialize());
};
