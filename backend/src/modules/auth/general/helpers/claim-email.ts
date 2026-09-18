import type { DbContext } from '#/core/context';
import { findUnboundInvitationTokensByEmail } from '#/modules/auth/auth-queries';
import { bindInactiveMemberships, deleteInvitationTokens } from '#/modules/memberships/memberships-queries';

interface ClaimEmailForUserOpts {
  userId: string;
  email: string;
}

/**
 * Binds every pending invitation addressed to `email` to the user, then deletes the invitation tokens:
 * a bound invitation is answered in-app, so the emailed link has no further use. Idempotent.
 */
export const claimEmailForUser = async (ctx: DbContext, { userId, email }: ClaimEmailForUserOpts) => {
  const pendingTokens = await findUnboundInvitationTokensByEmail(ctx, { email });

  const inactiveMembershipIds = [...new Set(pendingTokens.flatMap((t) => t.inactiveMembershipId ?? []))];
  if (!inactiveMembershipIds.length) return [];

  await bindInactiveMemberships(ctx, { ids: inactiveMembershipIds, userId });
  await deleteInvitationTokens(ctx, { inactiveMembershipIds });

  return inactiveMembershipIds;
};
