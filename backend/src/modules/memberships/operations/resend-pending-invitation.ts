import type { DbContext, UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { isHeldInvitation } from '#/modules/memberships/helpers/membership-helpers';
import { findInactiveMembershipInOrg } from '#/modules/memberships/inactive-memberships-queries';
import { mailInvitations } from '#/modules/memberships/operations/mail-invitations';
import { type InvitationMailsContext, refundInvitationMails, takeInvitationMails } from '#/modules/memberships/operations/take-invitation-mails';
import { getValidChannel } from '#/permissions/get-valid-channel';

/**
 * Resends the invitation email for a pending membership, named by the pending row's own id; the caller needs `update`
 * on the invited channel. Every pending invitation answers 204 alike: one no account holds gets a fresh link that
 * retires the older ones, one an account holds gets its invitation email again, and a held one stays held until its
 * channel is published. A missing, foreign or rejected row is 404.
 * @throws AppError 429 `invitation_limit_reached` past the tenant's daily mails, from {@link resendInvitation}.
 */
export async function resendPendingInvitationOp(ctx: UserContext, id: string) {
  const invitation = await findInactiveMembershipInOrg(ctx, { id });
  if (!invitation || invitation.rejectedAt) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'invitation' } });

  const { entity } = await getValidChannel(ctx, invitation.channelId, invitation.channelType, 'update');

  // The publish of its channel sends a held invitation; a resend before it would let the invitee into the draft.
  if (isHeldInvitation(invitation.channelType, entity, invitation.role)) return;

  await resendInvitation(ctx, { invitation, organization: ctx.var.organization });
}

interface ResendInvitationOpts {
  invitation: { id: string; email: string };
  /** The invitation's organization, whose default language an address without an account reads and whose name the mail gives. */
  organization: { defaultLanguageCode: string; name: string };
}

/**
 * Mails a pending, unheld invitation again within its tenant's caps: an address the tenant mailed in the last day gets
 * nothing, and its link keeps working; a mail that did not go out gives the day back.
 * @throws AppError 429 `invitation_limit_reached` past the tenant's daily mails, sending nothing.
 */
export async function resendInvitation(ctx: DbContext & InvitationMailsContext, { invitation, organization }: ResendInvitationOpts) {
  const heldBack = await takeInvitationMails(ctx, { mailNow: [invitation.email] });
  if (heldBack.size) return;

  const mailed = await mailInvitations(ctx, { ids: [invitation.id], organization });
  if (!mailed.length) await refundInvitationMails(ctx, [invitation.email]);
}
