import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { mailer } from '#/lib/mailer';
import { issueToken } from '#/modules/auth/tokens/token-lifecycle';
import { tokenLinkUrl } from '#/modules/auth/tokens/token-policies';
import type { TokenRecord } from '#/modules/auth/tokens/tokens-queries';
import { resolveEntity } from '#/modules/entities/entities-queries';
import { findPendingInactiveMembership } from '#/modules/memberships/memberships-queries';
import { findUserByEmail } from '#/modules/user/user-queries';
import { log } from '#/utils/logger';
import { invitationAddressEmail } from '../../../../../emails';

/**
 * Mails the invited address a new link to the invitation, linked to the signed-in account, for an account that does not
 * hold that address yet. The new link replaces every older one, so a forwarded link stops working; opened from the
 * invited inbox it proves the address, which `acceptInvitationTokenOp` then adds to the account.
 * @throws AppError 409 `user_mismatch` for a token linked to another account or an address another account holds, 400
 *   `invalid_request` when the account holds the address already, 404 `not_found` for an invitation no longer pending.
 */
export async function confirmInvitationAddressOp(ctx: UserContext, tokenRecord: TokenRecord) {
  const { inactiveMembershipId, email, userId, createdBy } = tokenRecord;
  if (!inactiveMembershipId) throw new AppError(400, 'invalid_request', 'warn');

  const user = ctx.var.user;
  if (userId && userId !== user.id) throw new AppError(409, 'user_mismatch', 'warn');

  const holder = await findUserByEmail(ctx, { email });
  if (holder) throw holder.id === user.id ? new AppError(400, 'invalid_request', 'warn') : new AppError(409, 'user_mismatch', 'warn');

  const reissued = await ctx.var.db.transaction(async (tx) => {
    const txCtx = { var: { db: tx } };

    // The locked row is the invitation's anchor: a concurrent answer, rejection or resend waits for this one.
    const invitation = await findPendingInactiveMembership(txCtx, { id: inactiveMembershipId, forUpdate: true });
    if (!invitation) return null;

    const entity = await resolveEntity(txCtx, { entityType: invitation.channelType, identifier: invitation.channelId });
    if (!entity) return null;

    const { token, rawToken } = await issueToken(txCtx, { type: 'invitation', email, userId: user.id, inactiveMembershipId, createdBy });
    return { entityName: entity.name, tokenId: token.id, rawToken };
  });

  if (!reissued) throw new AppError(404, 'not_found', 'warn');

  const statics = { entityName: reissued.entityName, accountEmail: user.email, confirmUrl: tokenLinkUrl('invitation', reissued.rawToken) };
  mailer
    .sendEmails(invitationAddressEmail, statics, [{ email, lng: user.language }])
    .catch((err) => log.error('Failed to send invitation address confirmation', { err }));

  log.info('Invitation address confirmation sent', { inactiveMembershipId, tokenId: reissued.tokenId });
}
