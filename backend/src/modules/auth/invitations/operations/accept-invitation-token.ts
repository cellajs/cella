import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import type { TokenRecord } from '#/modules/auth/tokens/tokens-queries';
import { handleMembershipInvitationOp } from '#/modules/memberships/operations/handle-membership-invitation';
import { findUserByEmail, upsertProvenEmail } from '#/modules/user/user-queries';

/**
 * Accepts the membership invitation behind a validated single-use token as the signed-in user. The account must hold the
 * invited address: one of its proven addresses, or the address a link linked to this account was mailed to
 * (`confirmInvitationAddressOp`), which accepting adds to it. An opened link alone proves nothing: it can be forwarded.
 * @throws AppError 409 `user_mismatch` for a token linked to another account or an address another account holds, 403
 *   `invitation_address_unproven` while the account does not hold the invited address.
 */
export async function acceptInvitationTokenOp(ctx: UserContext, tokenRecord: TokenRecord) {
  const { inactiveMembershipId, email, userId } = tokenRecord;
  if (!inactiveMembershipId) throw new AppError(400, 'invalid_request', 'warn');

  const user = ctx.var.user;

  // A token already linked to a user is that user's alone; possession of the link changes nothing.
  if (userId && userId !== user.id) throw new AppError(409, 'user_mismatch', 'warn');

  const holder = await findUserByEmail(ctx, { email });
  if (holder && holder.id !== user.id) throw new AppError(409, 'user_mismatch', 'warn');

  // Linked to this account when issued, the link reached it through the invited inbox: that proves the address.
  const provenByLink = !holder && userId === user.id;
  if (!holder && !provenByLink) throw new AppError(403, 'invitation_address_unproven', 'info', { meta: { email } });

  const entity = await handleMembershipInvitationOp(ctx, inactiveMembershipId, 'accept', { viaToken: true });

  if (provenByLink) await upsertProvenEmail(ctx, { userId: user.id, email, via: 'magic' });

  return entity;
}
