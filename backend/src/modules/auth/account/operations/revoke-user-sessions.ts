import type { UserContext } from '#/core/context';
import { findRecoveryTarget } from '#/modules/auth/account/operations/recovery-target';
import { sendAccountSecurityEmail } from '#/modules/auth/core/general/helpers/send-account-security-email';
import { revokeSessions } from '#/modules/auth/core/sessions/operations/revoke-sessions';
import { findGrantsByUser } from '#/modules/oauth-server/oauth-server-queries';
import { revokeGrant } from '#/modules/oauth-server/revoke-grant';

/**
 * Ends every session of another user, for a system administrator helping someone locked out or compromised: the rows
 * stay revoked `admin_revoke` for the sessions list, every stream bound to them closes, every app the person consented
 * to loses its grant and tokens (a stolen session may have consented one), and the person is mailed.
 * @throws What `findRecoveryTarget` throws.
 */
export async function revokeUserSessionsOp(ctx: UserContext, userId: string) {
  const user = await findRecoveryTarget(ctx, userId);

  const ended = await revokeSessions(ctx, { userId, all: true, reason: 'admin_revoke', by: ctx.var.user.id });
  for (const { row } of await findGrantsByUser(ctx, { userId })) await revokeGrant(ctx, { grantId: row.id });
  if (ended.length > 0) sendAccountSecurityEmail(user, 'admin-sessions-revoked');

  return { revoked: ended.length };
}
