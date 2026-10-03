import type { Context } from 'hono';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { deleteAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { sendAccountSecurityEmail } from '#/modules/auth/general/helpers/send-account-security-email';
import { setUserSession } from '#/modules/auth/sessions/operations/create-session';
import { revokeSessions } from '#/modules/auth/sessions/operations/revoke-sessions';
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
  // The user proved nothing here: the session records the method its admin signed in with.
  await setUserSession(ctx, user, ctx.var.session.authStrategy, 'impersonation');

  log.info('Started impersonation', { adminId: adminUser.id, targetUserId });
  sendAccountSecurityEmail(user, 'impersonation-started', { adminName: adminUser.name || adminUser.email });
};

/**
 * Stops the impersonation this request presents: its session ends and its cookie goes, so the browser is back on the
 * admin's own session. A request that presents none has nothing to stop and is answered the same, so a tab that missed
 * the end of an impersonation can always leave it.
 */
export const stopImpersonationOp = async (ctx: Context<Env>) => {
  // userGuard read an impersonation only from its own cookie, on top of the admin session this browser holds.
  const { session, impersonator } = ctx.var;

  // The admin's session cookie never left this browser: without the impersonation cookie it authenticates again.
  deleteAuthCookie(ctx, 'impersonation');
  if (session.type !== 'impersonation' || !impersonator) return;

  await revokeSessions(ctx, { userId: session.userId, sessionIds: [session.id], reason: 'impersonation_stopped', by: impersonator.id });

  log.info('Stopped impersonation', { adminId: impersonator.id, targetUserId: session.userId });
};
