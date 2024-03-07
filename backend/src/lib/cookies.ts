import { config } from 'config';
import { eq } from 'drizzle-orm';
import { Context } from 'hono';
import { setCookie as baseSetCookie } from 'hono/cookie';
import { User } from 'lucia';
import { db } from '../db/db';
import { auth } from '../db/lucia';
import { usersTable } from '../db/schema/users';
import { logEvent } from '../middlewares/logger/log-event';

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

  // Update lastSignInAt
  const lastSignInAt = new Date();
  await db.update(usersTable).set({ lastSignInAt }).where(eq(usersTable.id, userId));

  logEvent('User signed in', { user: userId, strategy: strategy });

  ctx.header('Set-Cookie', sessionCookie.serialize());
};

export const removeSessionCookie = (ctx: Context) => {
  const sessionCookie = auth.createBlankSessionCookie();
  ctx.header('Set-Cookie', sessionCookie.serialize());
};
