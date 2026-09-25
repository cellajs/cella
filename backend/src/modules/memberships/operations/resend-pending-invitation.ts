import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { resendInvitationEmail } from '#/modules/auth/general/helpers/resend-invitation';
import { findInvitationToken } from '#/modules/auth/tokens/tokens-queries';
import { findInactiveMembershipById } from '#/modules/memberships/memberships-queries';
import { getValidChannel } from '#/permissions/get-valid-channel';

/**
 * Resends the invitation email for a pending membership; the caller needs `update` on the invited channel.
 * The token comes from the pending row itself, never from the email address, which can hold newer tokens from other contexts.
 * A rejected invitation, or one answered meanwhile, is not re-sent: 404.
 */
export async function resendPendingInvitationOp(ctx: UserContext, id: string) {
  const inactiveMembership = await findInactiveMembershipById(ctx, { id });
  if (!inactiveMembership || inactiveMembership.organizationId !== ctx.var.organization.id) {
    throw new AppError(404, 'not_found', 'warn', { entityType: inactiveMembership?.channelType ?? 'organization' });
  }

  await getValidChannel(ctx, inactiveMembership.channelId, inactiveMembership.channelType, 'update');

  const oldToken = await findInvitationToken(ctx, { inactiveMembershipId: inactiveMembership.id });
  const sent = oldToken && (await resendInvitationEmail(ctx, oldToken));
  if (!sent) throw new AppError(404, 'token_not_found', 'warn');
}
