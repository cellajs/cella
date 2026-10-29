import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { deleteInvitationTokens } from '#/modules/auth/tokens/tokens-queries';
import { deleteInactiveMembership, findInactiveMembershipInOrg } from '#/modules/memberships/inactive-memberships-queries';
import { getValidChannel } from '#/permissions';
import { log } from '#/utils/logger';

/**
 * Withdraws an invitation, named by the pending row's own id: the row and its links go, and it frees its seat. The
 * caller needs `update` on the invited channel. A missing, foreign or declined row is 404: a decline is the invitee's
 * answer, and its row keeps the address from being invited again while the decline holds.
 */
export async function withdrawPendingInvitationOp(ctx: UserContext, id: string) {
  const invitation = await findInactiveMembershipInOrg(ctx, { id });
  if (!invitation || invitation.rejectedAt) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'invitation' } });

  await getValidChannel(ctx, invitation.channelId, invitation.channelType, 'update');

  await baseDb.transaction(async (tx) => {
    const txCtx = { var: { db: tx } };
    await deleteInvitationTokens(txCtx, { inactiveMembershipIds: [invitation.id] });
    await deleteInactiveMembership(txCtx, { id: invitation.id });
  });

  log.info('Membership invitation withdrawn', { inactiveMembershipId: invitation.id });
}
