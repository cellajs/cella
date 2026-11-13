import type { ChannelEntityType } from 'shared';
import type { DbContext } from '#/core/context';
import type { UserId } from '#/db/utils/ids';
import { issueTokens } from '#/modules/auth/tokens/token-lifecycle';
import { resolveEntity } from '#/modules/entities/entities-queries';
import type { InvitationModel } from '#/modules/memberships/invitations-db';
import { lockPendingInvitations, stampInvitationsMailed } from '#/modules/memberships/invitations-queries';
import { sendInvitationMails } from '#/modules/memberships/operations/send-invitation-mails';
import { stampWaitlistRequestInvited } from '#/modules/requests/requests-queries';
import { findUserById } from '#/modules/user/user-queries';
import type { EntityModel } from '#/tables';

/** One mail's invitations, of one channel, role and inviter, each with the link minted for it when no account holds its address. */
type MailBatch = { channel: EntityModel<ChannelEntityType>; group: (InvitationModel & { rawToken?: string })[] };

interface MailInvitationsOpts {
  /** Pending invitations of one organization. */
  ids: string[];
  /** Whose default language an address without an account reads, and whose name a mail about a channel below it gives. */
  organization: { defaultLanguageCode: string; name: string };
  /** Whose request sends the mails, stamped as the rows' writer; without one, an invitee's own resend, each inviter. */
  by?: UserId;
}

/**
 * Mails pending membership invitations: one no account holds with a fresh link that replaces its earlier ones, one an
 * account holds without a link, since it is answered in-app. Each row is locked and read again in the transaction that
 * issues its link, so an answer committed first leaves it out and one committed after deletes the link with the row.
 * A mail goes out per channel, role and inviter and names the inviter, whoever sends it. Once it went out, `mailedAt`
 * and the address's waitlist request are stamped; a failed one stamps nothing, so the invitation can be sent again.
 * @returns The invitations whose mail went out; one left out was answered meanwhile, or its mail failed.
 */
export async function mailInvitations(ctx: DbContext, { ids, organization, by }: MailInvitationsOpts) {
  if (!ids.length) return [];

  const batches = await ctx.var.db.transaction(async (tx) => {
    const txCtx = { var: { db: tx } };
    const invitations = await lockPendingInvitations(txCtx, { ids });

    const ready: MailBatch[] = [];
    for (const group of Map.groupBy(invitations, ({ channelId, role, createdBy }) => `${channelId}:${role}:${createdBy}`).values()) {
      const channel = await resolveEntity(txCtx, { entityType: group[0].channelType, identifier: group[0].channelId });
      if (!channel) continue;

      const tokenRequests = group.flatMap(({ id, email, userId, createdBy }) =>
        userId ? [] : [{ kind: 'invitation' as const, email, createdBy, inactiveMembershipId: id }],
      );
      const links = await issueTokens(txCtx, tokenRequests);
      const linkById = new Map(links.map(({ token, rawToken }) => [token.inactiveMembershipId, rawToken]));
      ready.push({ channel, group: group.map((invitation) => ({ ...invitation, rawToken: linkById.get(invitation.id) })) });
    }
    return ready;
  });

  const mailed: InvitationModel[] = [];
  for (const { channel, group } of batches) {
    const { channelType, role, createdBy, tenantId, organizationId } = group[0];
    const sent = await sendInvitationMails(ctx, {
      sender: await findUserById(ctx, { id: createdBy }),
      channel: { type: channelType, id: channel.id, tenantId, organizationId, name: channel.name, role },
      organization,
      invited: group.map(({ email, userId, rawToken }) => ({ email, userId, rawToken })),
    });
    if (!sent) continue;

    await stampInvitationsMailed(ctx, { ids: group.map(({ id }) => id), by: by ?? createdBy });
    await Promise.all(group.map(({ email }) => stampWaitlistRequestInvited(ctx, { email })));
    mailed.push(...group);
  }

  return mailed;
}
