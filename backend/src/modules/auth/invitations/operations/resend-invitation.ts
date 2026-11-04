import type { DbContext } from '#/core/context';
import { AppError } from '#/core/error';
import { issueToken } from '#/modules/auth/tokens/token-lifecycle';
import { findInvitationToken, type TokenRecord } from '#/modules/auth/tokens/tokens-queries';
import { resolveEntity } from '#/modules/entities/entities-queries';
import { isHeldInvitation } from '#/modules/memberships/helpers/membership-helpers';
import { findPendingInactiveMembership } from '#/modules/memberships/inactive-memberships-queries';
import { resendInvitation } from '#/modules/memberships/operations/resend-pending-invitation';
import { sendInvitationMails } from '#/modules/memberships/operations/send-invitation-mails';
import { stampWaitlistRequestInvited } from '#/modules/requests/requests-queries';
import { loadTenant } from '#/modules/tenants/load-tenant';
import { findUserByEmail, findUserById } from '#/modules/user/user-queries';
import { log } from '#/utils/logger';

/**
 * Re-sends the invitation one of its token ids names, for an invitee whose link expired; the id comes from that link,
 * so nothing else is asked. A membership invitation goes out as its inviter's resend does: within its tenant's caps, in
 * its organization's language, and never while it is held. A system invitation whose address no account holds gets
 * one fresh link. Anything else sends nothing, and so does a tenant past its day, so every id gets the same answer.
 */
export async function resendInvitationByTokenOp(ctx: DbContext, tokenId: string): Promise<void> {
  const token = await findInvitationToken(ctx, { id: tokenId });
  if (!token) return;
  if (!token.inactiveMembershipId) return resendSystemInvitation(ctx, token);

  const invitation = await findPendingInactiveMembership(ctx, { id: token.inactiveMembershipId });
  if (!invitation) return;

  const [tenant, organization, channel] = await Promise.all([
    loadTenant(invitation.tenantId),
    resolveEntity(ctx, { entityType: 'organization', identifier: invitation.organizationId }),
    resolveEntity(ctx, { entityType: invitation.channelType, identifier: invitation.channelId }),
  ]);
  if (tenant?.status !== 'active' || !organization || !channel) return;
  if (isHeldInvitation(invitation.channelType, channel, invitation.role)) return;

  const tenantCtx = { var: { db: ctx.var.db, tenantId: tenant.id, tenant } };
  await resendInvitation(tenantCtx, { invitation, organization }).catch((err) => {
    if (!(err instanceof AppError) || err.type !== 'invitation_limit_reached') throw err;
  });
}

/** A system invitation is every invitation token of its address outside a membership invitation: one fresh link replaces them all. */
async function resendSystemInvitation(ctx: DbContext, oldToken: TokenRecord) {
  const { email, createdBy } = oldToken;
  if (await findUserByEmail(ctx, { email })) return;

  const reissued = await ctx.var.db.transaction(async (tx) => {
    const txCtx = { var: { db: tx } };

    // The locked token is the invitation's anchor: a concurrent resend waits for this one.
    const anchor = await findInvitationToken(txCtx, { id: oldToken.id, forUpdate: true });
    if (!anchor) return null;

    const issued = await issueToken(txCtx, { type: 'invitation', email, createdBy });
    await stampWaitlistRequestInvited(txCtx, { email });
    return issued;
  });
  if (!reissued) return;

  // Replies reach the inviter, as on the first invitation; without one it reads as a system invite.
  const sender = createdBy ? await findUserById(ctx, { id: createdBy }) : undefined;
  await sendInvitationMails(ctx, { sender, invited: [{ email, rawToken: reissued.rawToken }] });
  log.info('System invitation has been resent', { tokenId: reissued.token.id });
}
