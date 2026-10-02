import { and, eq, isNull } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import { issueToken, type NewToken } from '#/modules/auth/tokens/token-lifecycle';
import { findInvitationToken, type TokenRecord } from '#/modules/auth/tokens/tokens-queries';
import { resolveEntity } from '#/modules/entities/entities-queries';
import { sendInvitationMails } from '#/modules/memberships/helpers/invitation-mail';
import { inactiveMembershipsTable } from '#/modules/memberships/inactive-memberships-db';
import { updateInactiveMembershipToken } from '#/modules/memberships/memberships-queries';
import { linkWaitlistRequest } from '#/modules/requests/requests-queries';
import { findUserByEmail, findUserById } from '#/modules/user/user-queries';
import { log } from '#/utils/logger';

/** The replacement token: the old token's invitation linkage under a new secret and lifetime. */
const replacementOf = (oldToken: TokenRecord): NewToken => ({
  type: 'invitation',
  email: oldToken.email,
  userId: oldToken.userId,
  inactiveMembershipId: oldToken.inactiveMembershipId,
  createdBy: oldToken.createdBy,
});

/**
 * Re-issues a pending invitation from one of its token rows and emails the new link. Pending means a membership
 * invitation whose row stands, unrejected, in a channel that still exists, or a system invitation whose address no
 * account holds. The new token gets a fresh id and the invitation's older tokens are deleted, so only the newest
 * link works. Returns false, sending nothing, when the invitation is no longer pending. Callers resolve the token and
 * authorize the resend themselves.
 */
export const resendInvitationEmail = async (ctx: DbContext, oldToken: TokenRecord): Promise<boolean> => {
  const { email, inactiveMembershipId } = oldToken;

  if (!inactiveMembershipId && (await findUserByEmail(ctx, { email }))) return false;

  const reissued = await ctx.var.db.transaction(async (tx) => {
    const txCtx = { var: { db: tx } };

    // The locked row is the invitation's anchor: a concurrent answer, rejection or resend waits for this one.
    if (inactiveMembershipId) {
      const [invitation] = await tx
        .select()
        .from(inactiveMembershipsTable)
        .where(and(eq(inactiveMembershipsTable.id, inactiveMembershipId), isNull(inactiveMembershipsTable.rejectedAt)))
        .for('update');
      if (!invitation) return null;

      const entity = await resolveEntity(txCtx, { entityType: invitation.channelType, identifier: invitation.channelId });
      if (!entity) return null;

      // The new token replaces every older token of the invitation.
      const { token, rawToken } = await issueToken(txCtx, replacementOf(oldToken));
      await updateInactiveMembershipToken(txCtx, { id: invitation.id, tokenId: token.id });

      return { invitation: { ...invitation, entity }, tokenId: token.id, rawToken };
    }

    const anchor = await findInvitationToken(txCtx, { id: oldToken.id, forUpdate: true });
    if (!anchor) return null;

    // A system invitation is every invitation token for the address outside a membership invitation; the new token
    // replaces them all.
    const { token, rawToken } = await issueToken(txCtx, replacementOf(oldToken));
    await linkWaitlistRequest(txCtx, { email, tokenId: token.id });

    return { invitation: null, tokenId: token.id, rawToken };
  });

  if (!reissued) return false;

  // Replies reach the inviter, as on the first invitation; without one it reads as a system invite.
  const sender = oldToken.createdBy ? await findUserById(ctx, { id: oldToken.createdBy }) : undefined;
  const { invitation, tokenId, rawToken } = reissued;
  const invited = [{ email, userId: oldToken.userId, rawToken }];

  if (invitation) {
    const { entity } = invitation;
    await sendInvitationMails(ctx, {
      sender: sender ?? { name: 'System' },
      channel: { type: invitation.channelType, slug: entity.slug, name: entity.name, role: invitation.role },
      // A channel below the organization carries no default language here: the app's applies.
      organization: 'defaultLanguage' in entity ? entity : null,
      invited,
    });
    log.info('Membership invitation has been resent', { inactiveMembershipId: invitation.id, tokenId });
  } else {
    await sendInvitationMails(ctx, { sender: sender ?? { name: 'System' }, invited });
    log.info('System invitation has been resent', { tokenId });
  }

  return true;
};
