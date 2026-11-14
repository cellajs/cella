import type { DbContext } from '#/core/context';
import { deleteInvitationTokens } from '#/modules/auth/tokens/tokens-queries';
import { bindInvitationsByEmail } from '#/modules/memberships/invitations-queries';

/**
 * Binds every pending, unbound invitation addressed to `email` to the user, then deletes their invitation tokens: a
 * bound invitation is answered in-app, so the emailed link has no further use. Keyed on the invitation's address, so an
 * invitation without a live token is claimed too. Idempotent. Call it only once the user has proven the inbox; an
 * unproven claim would let anyone capture another person's invitations.
 */
export const claimEmailForUser = async (ctx: DbContext, { userId, email }: { userId: string; email: string }) => {
  const invitationIds = await bindInvitationsByEmail(ctx, { email, userId });
  await deleteInvitationTokens(ctx, { invitationIds });
  return invitationIds;
};
