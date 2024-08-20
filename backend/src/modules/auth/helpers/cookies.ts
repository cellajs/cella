import { config } from 'config';
import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { setCookie as baseSetCookie } from 'hono/cookie';
import type { User } from 'lucia';
import { db } from '../../../db/db';
import { auth } from '../../../db/lucia';
import { usersTable } from '../../../db/schema/users';
import { logEvent } from '../../../middlewares/logger/log-event';

const isProduction = config.mode === 'production';

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
  const session = await auth.createSession(userId, { type: 'regular', adminUserId: null });
  const sessionCookie = auth.createSessionCookie(session.id);

  const lastSignInAt = new Date();
  await db.update(usersTable).set({ lastSignInAt }).where(eq(usersTable.id, userId));

  logEvent('User signed in', { user: userId, strategy: strategy });

  ctx.header('Set-Cookie', sessionCookie.serialize());
};

export const setImpersonationSessionCookie = async (ctx: Context, userId: User['id'], adminUserId: User['id']) => {
  const session = await auth.createSession(userId, { type: 'impersonation', adminUserId });
  const sessionCookie = auth.createSessionCookie(session.id);

  logEvent('Admin impersonation signed in', { user: userId, strategy: 'impersonation' });

  ctx.header('Set-Cookie', sessionCookie.serialize());
};

export const removeSessionCookie = (ctx: Context) => {
  const sessionCookie = auth.createBlankSessionCookie();
  ctx.header('Set-Cookie', sessionCookie.serialize());
};
