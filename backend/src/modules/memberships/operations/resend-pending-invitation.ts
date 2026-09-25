import { appConfig, type ChannelEntityType } from 'shared';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { mailer } from '#/lib/mailer';
import { resendInvitationEmail } from '#/modules/auth/general/helpers/resend-invitation';
import { findInvitationToken } from '#/modules/auth/tokens/tokens-queries';
import type { InactiveMembershipModel } from '#/modules/memberships/inactive-memberships-db';
import { findInactiveMembershipById } from '#/modules/memberships/memberships-queries';
import { findUserById } from '#/modules/user/user-queries';
import { getValidChannel } from '#/permissions/get-valid-channel';
import type { EntityModel } from '#/tables';
import { log } from '#/utils/logger';
import { slugFromEmail } from '#/utils/slug-from-email';
import { memberInviteEmail } from '../../../../emails';

/**
 * Resends the invitation email for a pending membership, named by the pending row's own id; the caller needs `update`
 * on the invited channel. Every pending invitation answers 204 alike: one holding a token gets a fresh link that retires
 * the older ones, one without (sent to an address an account held) gets its invitation email again. A missing, foreign
 * or rejected row is 404.
 */
export async function resendPendingInvitationOp(ctx: UserContext, id: string) {
  const invitation = await findInactiveMembershipById(ctx, { id });
  if (!invitation || invitation.organizationId !== ctx.var.organization.id || invitation.rejectedAt) {
    throw new AppError(404, 'not_found', 'warn', { entityType: 'organization' });
  }

  const { entity } = await getValidChannel(ctx, invitation.channelId, invitation.channelType, 'update');

  const token = await findInvitationToken(ctx, { inactiveMembershipId: invitation.id });
  if (!token) return remindInvitee(ctx, invitation, entity);

  // The re-issue refuses an invitation answered meanwhile.
  const sent = await resendInvitationEmail(ctx, token);
  if (!sent) throw new AppError(404, 'not_found', 'warn', { entityType: 'organization' });
}

/** The invitation email without a token, as an invitation to an address held by an account is first sent. */
async function remindInvitee(
  ctx: UserContext,
  invitation: InactiveMembershipModel,
  entity: EntityModel<ChannelEntityType>,
): Promise<void> {
  // Replies reach the inviter, as on the first invitation.
  const sender = await findUserById(ctx, { id: invitation.createdBy });
  const staticProps = {
    senderName: sender?.name ?? 'System',
    senderThumbnailUrl: sender?.thumbnailUrl ?? null,
    entityName: entity.name,
    role: invitation.role,
  };
  const recipient = {
    email: invitation.email,
    lng: 'defaultLanguage' in entity ? entity.defaultLanguage : appConfig.defaultLanguage,
    name: slugFromEmail(invitation.email),
    memberInviteLink: `${appConfig.frontendUrl}/${invitation.channelType}/${entity.slug}`,
  };

  await mailer.prepareEmails(memberInviteEmail, staticProps, [recipient], sender?.email);
  log.info('Membership invitation has been resent', { inactiveMembershipId: invitation.id });
}
