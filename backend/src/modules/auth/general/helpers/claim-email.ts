import type { DbContext } from '#/core/context';
import { deleteInvitationTokens } from '#/modules/auth/tokens/tokens-queries';
import { bindInactiveMembershipsByEmail } from '#/modules/memberships/memberships-queries';

interface ClaimEmailForUserOpts {
  userId: string;
  email: string;
}

/**
 * Binds every pending, unbound invitation addressed to `email` to the user, then deletes their invitation tokens: a
 * bound invitation is answered in-app, so the emailed link has no further use. Keyed on the invitation's address, so an
 * invitation without a live token is claimed too. Idempotent. Call it only once the user has proven the inbox; an
 * unproven claim would let anyone capture another person's invitations.
 */
export const claimEmailForUser = async (ctx: DbContext, { userId, email }: ClaimEmailForUserOpts) => {
  const inactiveMembershipIds = await bindInactiveMembershipsByEmail(ctx, { email, userId });
  await deleteInvitationTokens(ctx, { inactiveMembershipIds });
  return inactiveMembershipIds;
};
