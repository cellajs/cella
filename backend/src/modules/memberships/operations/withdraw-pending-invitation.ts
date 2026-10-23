import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { deleteInvitationTokens } from '#/modules/auth/tokens/tokens-queries';
import { deleteInactiveMembership, findInactiveMembershipById } from '#/modules/memberships/memberships-queries';
import { getValidChannel } from '#/permissions/get-valid-channel';
import { log } from '#/utils/logger';

/**
 * Withdraws an invitation, named by the pending row's own id: the row and its links go, and it frees its seat. The
 * caller needs `update` on the invited channel. A missing or foreign row is 404.
 */
export async function withdrawPendingInvitationOp(ctx: UserContext, id: string) {
  const invitation = await findInactiveMembershipById(ctx, { id });
  if (!invitation || invitation.organizationId !== ctx.var.organization.id) {
    throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'invitation' } });
  }

  await getValidChannel(ctx, invitation.channelId, invitation.channelType, 'update');

  await baseDb.transaction(async (tx) => {
    const txCtx = { var: { db: tx } };
    await deleteInvitationTokens(txCtx, { inactiveMembershipIds: [invitation.id] });
    await deleteInactiveMembership(txCtx, { id: invitation.id });
  });

  log.info('Membership invitation withdrawn', { inactiveMembershipId: invitation.id });
}
