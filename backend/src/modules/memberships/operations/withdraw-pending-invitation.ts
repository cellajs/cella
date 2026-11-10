import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { deleteInactiveMembership, findInactiveMembershipInOrg } from '#/modules/memberships/inactive-memberships-queries';
import { getValidChannel } from '#/permissions/get-valid-channel';
import { log } from '#/utils/logger';

/**
 * Withdraws an invitation, named by the pending row's own id: the row and its links go, and it frees its seat. The
 * caller needs `update` on the invited channel. A missing, foreign or declined row is 404: a decline is the invitee's
 * answer, and its row keeps the address from being invited again while the decline holds.
 */
export async function withdrawPendingInvitationOp(ctx: UserContext, id: string) {
  const invitation = await findInactiveMembershipInOrg(ctx, { id });
  if (!invitation || invitation.declinedAt) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'invitation' } });

  // Withdrawing removes a row, as removing a member does, so an archived channel allows it.
  await getValidChannel(ctx, invitation.channelId, invitation.channelType, 'update', { ignoreArchive: true });

  await deleteInactiveMembership(ctx, { id: invitation.id });

  log.info('Membership invitation withdrawn', { inactiveMembershipId: invitation.id });
}
