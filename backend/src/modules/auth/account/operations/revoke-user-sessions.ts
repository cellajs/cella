import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { sendAccountSecurityEmail } from '#/modules/auth/core/general/helpers/send-account-security-email';
import { revokeSessions } from '#/modules/auth/core/sessions/operations/revoke-sessions';
import { findUserById } from '#/modules/user/user-queries';

/**
 * Ends every session of another user, for a system administrator helping someone locked out or compromised: the rows
 * stay revoked `admin_revoke` for the sessions list, every stream bound to them closes, and the person is mailed.
 * @throws AppError 404 when no user has the id.
 */
export async function revokeUserSessionsOp(ctx: UserContext, userId: string) {
  const user = await findUserById(ctx, { id: userId });
  if (!user) throw new AppError(404, 'not_found', 'warn', { entityType: 'user' });

  const ended = await revokeSessions(ctx, { userId, all: true, reason: 'admin_revoke', by: ctx.var.user.id });
  if (ended.length > 0) sendAccountSecurityEmail(user, 'admin-sessions-revoked');

  return { revoked: ended.length };
}
