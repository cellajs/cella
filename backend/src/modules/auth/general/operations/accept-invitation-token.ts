import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { sendAccountSecurityEmail } from '#/modules/auth/general/helpers/send-account-security-email';
import type { TokenModel } from '#/modules/auth/tokens-db';
import { handleMembershipInvitationOp } from '#/modules/memberships/operations/handle-membership-invitation';
import { log } from '#/utils/logger';
import { slugFromEmail } from '#/utils/slug-from-email';

/** Accepts the membership invitation behind a validated single-use token as the signed-in user, whatever address it was sent to. */
export async function acceptInvitationTokenOp(ctx: AuthContext, tokenRecord: TokenModel) {
  if (!tokenRecord.inactiveMembershipId) throw new AppError(400, 'invalid_request', 'warn');

  const user = ctx.var.user;

  // A token already linked to a user is that user's alone; possession of the link changes nothing.
  if (tokenRecord.userId && tokenRecord.userId !== user.id) throw new AppError(409, 'user_mismatch', 'warn');

  const entity = await handleMembershipInvitationOp(ctx, tokenRecord.inactiveMembershipId, 'accept', {
    viaToken: true,
  });

  invalidateCache.user(user.id);

  // Accepted by an account on another address than the one invited: tell the invited inbox, since it may not be theirs.
  if (tokenRecord.email !== user.email) {
    log.warn('Invitation accepted by an account on another address', {
      tokenId: tokenRecord.id,
      invitedEmail: tokenRecord.email,
      userId: user.id,
    });
    sendAccountSecurityEmail(
      { email: tokenRecord.email, name: slugFromEmail(tokenRecord.email) },
      'invitation-accepted-elsewhere',
      { entityName: entity.name, accountEmail: user.email },
    );
  }

  return entity;
}
