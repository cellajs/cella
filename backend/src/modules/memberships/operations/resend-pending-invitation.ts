import type { ChannelEntityType } from 'shared';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { resendInvitationEmail } from '#/modules/auth/invitations/operations/resend-invitation';
import { findInvitationToken } from '#/modules/auth/tokens/tokens-queries';
import { isHeldInvitation } from '#/modules/memberships/helpers/membership-helpers';
import type { InactiveMembershipModel } from '#/modules/memberships/inactive-memberships-db';
import { findInactiveMembershipInOrg, stampInactiveMembershipsReminded } from '#/modules/memberships/memberships-queries';
import { sendInvitationMails } from '#/modules/memberships/operations/invitation-mail';
import { findUserById } from '#/modules/user/user-queries';
import { getValidChannel } from '#/permissions/get-valid-channel';
import type { EntityModel } from '#/tables';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';

/**
 * Resends the invitation email for a pending membership, named by the pending row's own id; the caller needs `update`
 * on the invited channel. Every pending invitation answers 204 alike: one holding a token gets a fresh link that retires
 * the older ones, one without (sent to an address an account held) gets its invitation email again, and a held one
 * stays held until its channel is published. A missing, foreign or rejected row is 404.
 */
export async function resendPendingInvitationOp(ctx: UserContext, id: string) {
  const invitation = await findInactiveMembershipInOrg(ctx, { id });
  if (!invitation || invitation.rejectedAt) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'invitation' } });

  const { entity } = await getValidChannel(ctx, invitation.channelId, invitation.channelType, 'update');

  // The publish of its channel sends a held invitation; a resend before it would let the invitee into the draft.
  if (isHeldInvitation(invitation.channelType, entity, invitation.role)) return;

  const token = await findInvitationToken(ctx, { inactiveMembershipId: invitation.id });
  if (!token) return remindInvitee(ctx, invitation, entity);

  // The re-issue refuses an invitation answered meanwhile.
  const sent = await resendInvitationEmail(ctx, token);
  if (!sent) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'invitation' } });
}

/** The invitation email without a token, as an invitation to an address held by an account is first sent. */
async function remindInvitee(ctx: UserContext, invitation: InactiveMembershipModel, entity: EntityModel<ChannelEntityType>): Promise<void> {
  // Replies reach the inviter, as on the first invitation.
  const sender = await findUserById(ctx, { id: invitation.createdBy });
  await sendInvitationMails(ctx, {
    sender,
    channel: { type: invitation.channelType, slug: entity.slug, name: entity.name, role: invitation.role },
    organization: ctx.var.organization,
    invited: [{ email: invitation.email, userId: invitation.userId }],
  });
  await stampInactiveMembershipsReminded(ctx, { ids: [invitation.id], remindedAt: getIsoDate() });
  log.info('Membership invitation has been resent', { inactiveMembershipId: invitation.id });
}
