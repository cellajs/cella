import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import type { TokenRecord } from '#/modules/auth/tokens/tokens-queries';
import { handleMembershipInvitationOp } from '#/modules/memberships/operations/handle-membership-invitation';
import { findUserByEmail } from '#/modules/user/user-queries';

/**
 * Accepts the membership invitation behind a validated single-use token as the signed-in user. The account must hold the
 * invited address, or open a link linked to this account and mailed to that address (`confirmInvitationAddressOp`). An
 * opened link alone proves nothing: it can be forwarded. Accepting grants the membership and never adds the address to
 * the account: the link shows only that its holder handed it to this browser, and every address an account holds signs
 * in to it.
 * @throws AppError 409 `user_mismatch` for a token linked to another account or an address another account holds, 403
 *   `invitation_address_unproven` for an account that neither holds the invited address nor opened such a link.
 */
export async function acceptInvitationTokenOp(ctx: UserContext, tokenRecord: TokenRecord) {
  const { inactiveMembershipId, email, userId } = tokenRecord;
  if (!inactiveMembershipId) throw new AppError(400, 'invalid_request', 'warn');

  const user = ctx.var.user;

  // A token already linked to a user is that user's alone; possession of the link changes nothing.
  if (userId && userId !== user.id) throw new AppError(409, 'user_mismatch', 'warn');

  const holder = await findUserByEmail(ctx, { email });
  if (holder && holder.id !== user.id) throw new AppError(409, 'user_mismatch', 'warn');

  // Linked to this account when issued, the link reached it through the invited inbox.
  if (!holder && userId !== user.id) throw new AppError(403, 'invitation_address_unproven', 'info', { meta: { email } });

  return handleMembershipInvitationOp(ctx, inactiveMembershipId, 'accept', { viaToken: true });
}
