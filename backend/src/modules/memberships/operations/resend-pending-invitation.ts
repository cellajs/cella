import type { ChannelEntityType } from 'shared';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { resendInvitationEmail } from '#/modules/auth/invitations/operations/resend-invitation';
import { findInvitationToken } from '#/modules/auth/tokens/tokens-queries';
import type { InactiveMembershipModel } from '#/modules/memberships/inactive-memberships-db';
import { findInactiveMembershipById } from '#/modules/memberships/memberships-queries';
import { sendInvitationMails } from '#/modules/memberships/operations/invitation-mail';
import { findUserById } from '#/modules/user/user-queries';
import { getValidChannel } from '#/permissions/get-valid-channel';
import type { EntityModel } from '#/tables';
import { log } from '#/utils/logger';

/**
 * Resends the invitation email for a pending membership, named by the pending row's own id; the caller needs `update`
 * on the invited channel. Every pending invitation answers 204 alike: one holding a token gets a fresh link that retires
 * the older ones, one without (sent to an address an account held) gets its invitation email again. A missing, foreign
 * or rejected row is 404.
 */
export async function resendPendingInvitationOp(ctx: UserContext, id: string) {
  const invitation = await findInactiveMembershipById(ctx, { id });
  if (!invitation || invitation.organizationId !== ctx.var.organization.id || invitation.rejectedAt) {
    throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'invitation' } });
  }

  const { entity } = await getValidChannel(ctx, invitation.channelId, invitation.channelType, 'update');

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
    sender: sender ?? { name: 'System' },
    channel: { type: invitation.channelType, slug: entity.slug, name: entity.name, role: invitation.role },
    organization: ctx.var.organization,
    invited: [{ email: invitation.email, userId: invitation.userId }],
  });
  log.info('Membership invitation has been resent', { inactiveMembershipId: invitation.id });
}
