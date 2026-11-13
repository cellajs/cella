import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { findInvitationInOrg } from '#/modules/memberships/invitations-queries';
import { mailWithinCaps } from '#/modules/memberships/operations/mail-invitations';
import { assertTenantInvites } from '#/modules/tenants/tenant-restrictions';
import { getValidChannel } from '#/permissions/get-valid-channel';

/**
 * Resends the invitation email for a pending membership, named by the pending row's own id; the caller needs `update`
 * on the invited channel. Every pending invitation answers 204 alike: one no account holds gets a fresh link that
 * retires the older ones, one an account holds gets its invitation email again, and a held one stays held until its
 * channel is published. A missing, foreign or declined row is 404.
 * @throws AppError 403 `restrict_by_tenant_kind` in a tenant whose kind invites no one.
 * @throws AppError 429 `invitation_limit_reached` past the tenant's daily mails, from {@link mailWithinCaps}.
 */
export async function resendPendingInvitationOp(ctx: UserContext, id: string) {
  const invitation = await findInvitationInOrg(ctx, { id });
  if (!invitation || invitation.status === 'declined') throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'invitation' } });

  await getValidChannel(ctx, invitation.channelId, invitation.channelType, 'update');
  assertTenantInvites(ctx.var.tenant);

  // The publish of its channel sends a held invitation; a resend before it would let the invitee into the draft.
  if (invitation.status === 'held') return;

  await mailWithinCaps(ctx, { invitations: [invitation], organization: ctx.var.organization, by: ctx.var.user.id });
}
