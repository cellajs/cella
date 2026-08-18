import { eq } from 'drizzle-orm';
import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import { findInactiveMembershipById, findInvitationToken } from '#/modules/auth/auth-queries';
import { resendInvitationEmail } from '#/modules/auth/general/helpers/resend-invitation';
import { tokensTable } from '#/modules/auth/tokens-db';
import { getValidChannel } from '#/permissions/get-valid-channel';

/**
 * Resends the invitation email for a pending membership; the caller needs `update` on the invited channel.
 * The token comes from the pending row itself, never from the email address, which can hold newer tokens from other contexts.
 */
export async function resendPendingInvitationOp(ctx: AuthContext, id: string) {
  const inactiveMembership = await findInactiveMembershipById(ctx, { id });
  if (!inactiveMembership || inactiveMembership.organizationId !== ctx.var.organization.id) {
    throw new AppError(404, 'not_found', 'warn', { entityType: inactiveMembership?.channelType ?? 'organization' });
  }

  await getValidChannel(ctx, inactiveMembership.channelId, inactiveMembership.channelType, 'update');

  const oldToken = await findInvitationToken(ctx, {
    filters: [eq(tokensTable.type, 'invitation'), eq(tokensTable.inactiveMembershipId, inactiveMembership.id)],
  });
  if (!oldToken) throw new AppError(404, 'token_not_found', 'warn');

  await resendInvitationEmail(ctx, oldToken);
}
