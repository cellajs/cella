import { and, eq, isNull } from 'drizzle-orm';
import { appConfig } from 'shared';
import { nanoid } from 'shared/utils/nanoid';
import type { DbContext } from '#/core/context';
import { mailer } from '#/lib/mailer';
import { insertInvitationToken } from '#/modules/auth/auth-queries';
import { tokensTable, type UnsafeTokenModel } from '#/modules/auth/tokens-db';
import { resolveEntity } from '#/modules/entities/entities-queries';
import { inactiveMembershipsTable } from '#/modules/memberships/inactive-memberships-db';
import { deleteInvitationTokens, updateInactiveMembershipToken } from '#/modules/memberships/memberships-queries';
import { linkWaitlistRequest } from '#/modules/requests/requests-queries';
import { findUserByEmail, findUserById } from '#/modules/user/user-queries';
import { hashToken } from '#/utils/hash-token';
import { log } from '#/utils/logger';
import { slugFromEmail } from '#/utils/slug-from-email';
import { createDate, TimeSpan } from '#/utils/time-span';
import { memberInviteWithTokenEmail, systemInviteEmail } from '../../../../../emails';

/** The replacement row: the old row's invitation linkage, a new secret and a week to use it. */
const newTokenValues = (oldToken: UnsafeTokenModel, rawToken: string) => ({
  secret: hashToken(rawToken),
  type: 'invitation' as const,
  email: oldToken.email,
  userId: oldToken.userId,
  inactiveMembershipId: oldToken.inactiveMembershipId,
  createdBy: oldToken.createdBy,
  expiresAt: createDate(new TimeSpan(7, 'd')),
});

/**
 * Re-issues a pending invitation from one of its token rows and emails the new link. Pending means a membership
 * invitation whose row stands, unrejected, in a channel that still exists, or a system invitation whose address no
 * account has proven. The new token gets a fresh id and the invitation's older tokens are deleted, so only the newest
 * link works. Returns false, sending nothing, when the invitation is no longer pending. Callers resolve the token and
 * authorize the resend themselves.
 */
export const resendInvitationEmail = async (ctx: DbContext, oldToken: UnsafeTokenModel): Promise<boolean> => {
  const { email, inactiveMembershipId } = oldToken;

  if (!inactiveMembershipId && (await findUserByEmail(ctx, { email, verifiedOnly: true }))) return false;

  const rawToken = nanoid(40);

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

      const entity = await resolveEntity(txCtx, {
        entityType: invitation.channelType,
        identifier: invitation.channelId,
      });
      if (!entity) return null;

      await deleteInvitationTokens(txCtx, { inactiveMembershipIds: [invitation.id] });
      const token = await insertInvitationToken(txCtx, { values: newTokenValues(oldToken, rawToken) });
      await updateInactiveMembershipToken(txCtx, { id: invitation.id, tokenId: token.id });

      return { invitation: { ...invitation, entity }, tokenId: token.id };
    }

    const [anchor] = await tx
      .select({ id: tokensTable.id })
      .from(tokensTable)
      .where(eq(tokensTable.id, oldToken.id))
      .for('update');
    if (!anchor) return null;

    // A system invitation is every invitation token for the address outside a membership invitation.
    await tx
      .delete(tokensTable)
      .where(
        and(eq(tokensTable.type, 'invitation'), eq(tokensTable.email, email), isNull(tokensTable.inactiveMembershipId)),
      );
    const token = await insertInvitationToken(txCtx, { values: newTokenValues(oldToken, rawToken) });
    await linkWaitlistRequest(txCtx, { email, tokenId: token.id });

    return { invitation: null, tokenId: token.id };
  });

  if (!reissued) return false;

  const recipient = {
    email,
    lng: appConfig.defaultLanguage,
    name: slugFromEmail(email),
    inviteLink: `${appConfig.backendAuthUrl}/invoke-token/invitation/${rawToken}`,
  };

  // Replies reach the inviter, as on the first invitation; without one it reads as a system invite.
  const sender = oldToken.createdBy ? await findUserById(ctx, { id: oldToken.createdBy }) : undefined;
  const senderProps = { senderName: sender?.name ?? 'System', senderThumbnailUrl: sender?.thumbnailUrl ?? null };

  const { invitation, tokenId } = reissued;

  if (invitation) {
    const { entity } = invitation;
    const emailProps = { ...senderProps, entityName: entity.name, role: invitation.role };
    const lng = 'defaultLanguage' in entity ? entity.defaultLanguage : appConfig.defaultLanguage;

    await mailer.prepareEmails(memberInviteWithTokenEmail, emailProps, [{ ...recipient, lng }], sender?.email);
    log.info('Membership invitation has been resent', { inactiveMembershipId: invitation.id, tokenId });
  } else {
    await mailer.prepareEmails(systemInviteEmail, senderProps, [recipient], sender?.email);
    log.info('System invitation has been resent', { tokenId });
  }

  return true;
};
