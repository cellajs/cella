import type { ChannelEntityType } from 'shared';
import type { DbContext } from '#/core/context';
import type { UserId } from '#/db/utils/ids';
import { issueTokens } from '#/modules/auth/tokens/token-lifecycle';
import { resolveEntity } from '#/modules/entities/entities-queries';
import type { InvitationModel } from '#/modules/memberships/invitations-db';
import { lockPendingInvitations, releaseHeldInvitations, stampInvitationsMailed } from '#/modules/memberships/invitations-queries';
import { sendInvitationMails } from '#/modules/memberships/operations/send-invitation-mails';
import {
  type InvitationMailsContext,
  refundInvitationMails,
  type TakenInvitationMails,
  takeInvitationMails,
} from '#/modules/memberships/operations/take-invitation-mails';
import { stampWaitlistRequestMailed } from '#/modules/requests/requests-queries';
import { findUserById } from '#/modules/user/user-queries';
import type { EntityModel } from '#/tables';
import { log } from '#/utils/logger';

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
async function mailInvitations(ctx: DbContext, { ids, organization, by }: MailInvitationsOpts) {
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
    await Promise.all(group.map(({ email }) => stampWaitlistRequestMailed(ctx, { email })));
    mailed.push(...group);
  }

  return mailed;
}

interface MailWithinCapsOpts extends Omit<MailInvitationsOpts, 'ids'> {
  /** Pending invitations of one organization. */
  invitations: { id: string; email: string }[];
  /** What a take before the caller's row writes reserved; without it the caps are taken here for every address. */
  taken?: TakenInvitationMails;
}

/**
 * Mails invitations within their tenant's caps, the one path every invitation mail takes: an address the tenant mailed
 * in the last day gets nothing and its link keeps working, and an address whose mail did not go out gets its day back.
 * @returns The invitations whose mail went out.
 * @throws AppError 429 `invitation_limit_reached` past the tenant's daily mails, from a take made here; nothing is sent.
 */
export async function mailWithinCaps(ctx: DbContext & InvitationMailsContext, { invitations, taken, ...opts }: MailWithinCapsOpts) {
  const { emails, heldBack } = taken ?? (await takeInvitationMails(ctx, { mailNow: invitations.map(({ email }) => email) }));

  const toMail = invitations.filter(({ email }) => !heldBack.has(email));
  const mailed = await mailInvitations(ctx, { ...opts, ids: toMail.map(({ id }) => id) });
  const mailedEmails = new Set(mailed.map(({ email }) => email));
  await refundInvitationMails(
    ctx,
    emails.filter((email) => !heldBack.has(email) && !mailedEmails.has(email)),
  );
  return mailed;
}

interface MailHeldInvitationsOpts extends Pick<MailInvitationsOpts, 'organization'> {
  /** A published channel and its descendants. */
  channelIds: string[];
  /** Who published. */
  by: UserId;
}

/**
 * Mails the invitations held while their channel was a draft. Their release to pending is the claim, so of two publish
 * calls only one mails them, and one whose mail fails waits as pending for a resend. Their mails counted toward the
 * tenant's day when they were made, so no cap is taken here.
 */
export async function mailHeldInvitations(ctx: DbContext & InvitationMailsContext, { channelIds, organization, by }: MailHeldInvitationsOpts) {
  const released = await releaseHeldInvitations(ctx, { channelIds, by });
  if (!released.length) return [];

  const mailed = await mailWithinCaps(ctx, { invitations: released, organization, by, taken: { emails: [], heldBack: new Set() } });
  log.info('Held invitations mailed', { count: mailed.length, released: released.length });
  return mailed;
}
