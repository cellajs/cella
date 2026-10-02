import type { Context } from 'hono';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { deleteAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { sendAccountSecurityEmail } from '#/modules/auth/general/helpers/send-account-security-email';
import { setUserSession } from '#/modules/auth/sessions/operations/create-session';
import { revokeSessions } from '#/modules/auth/sessions/operations/revoke-sessions';
import { findSessionById } from '#/modules/auth/sessions/sessions-queries';
import { findUserById } from '#/modules/user/user-queries';
import { log } from '#/utils/logger';

interface StartImpersonationOpts {
  targetUserId: string;
}

/**
 * Starts impersonating a user in this browser: an impersonation session layered over the admin's own, and a security mail
 * to the user.
 * @throws AppError 404 `not_found` for an unknown user.
 */
export const startImpersonationOp = async (ctx: Context<Env>, { targetUserId }: StartImpersonationOpts) => {
  const user = await findUserById(ctx, { id: targetUserId });

  if (!user) throw new AppError(404, 'not_found', 'warn', { entityType: 'user', meta: { targetUserId } });

  const adminUser = ctx.var.user;
  await setUserSession(ctx, user, 'passkey', 'impersonation');

  log.info('Started impersonation', { adminId: adminUser.id, targetUserId });
  sendAccountSecurityEmail(user, 'impersonation-started', { adminName: adminUser.name || adminUser.email });
};

/**
 * Stops the impersonation this request presents: its session ends and its cookie goes, so the browser is back on the
 * admin's own session.
 * @throws AppError 400 `invalid_request` when the request presents no impersonation, 401 `unauthorized` when the admin
 *   session behind it is gone.
 */
export const stopImpersonationOp = async (ctx: Context<Env>) => {
  // userGuard read an impersonation only from its own cookie, on top of the admin session this browser holds.
  const { session } = ctx.var;
  if (session.type !== 'impersonation' || !session.impersonatorSessionId) {
    throw new AppError(400, 'invalid_request', 'warn');
  }

  const admin = await findSessionById(ctx, { id: session.impersonatorSessionId });
  if (!admin) throw new AppError(401, 'unauthorized', 'warn');

  await revokeSessions(ctx, { userId: session.userId, sessionIds: [session.id], reason: 'impersonation_stopped', by: admin.userId });

  // The admin's session cookie never left this browser: without the impersonation cookie it authenticates again.
  deleteAuthCookie(ctx, 'impersonation');

  log.info('Stopped impersonation', { adminId: admin.userId, targetUserId: session.userId });
};
