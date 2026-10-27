import type { OrgContext } from '#/core/context';
import { issueTokens } from '#/modules/auth/tokens/token-lifecycle';
import { resolveEntity } from '#/modules/entities/entities-queries';
import { findPendingInactiveMembershipsByChannels, stampInactiveMembershipsReminded } from '#/modules/memberships/memberships-queries';
import { sendInvitationMails } from '#/modules/memberships/operations/invitation-mail';
import { findUserById } from '#/modules/user/user-queries';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';

interface DispatchDeferredInvitesOpts {
  /** Channel entity ids whose pending invites should be dispatched (e.g. a published course + descendants). */
  channelIds: string[];
}

/**
 * Sends the invitations held while their context was unpublished: the ones whose mail never went out, which carry no
 * `remindedAt`. One mailed when it was made, or dispatched before, is left alone, so a publish flow may hand over a
 * context again. An invitation no account holds yet goes by link: its token is rotated (fresh secret and expiry)
 * because raw tokens are unrecoverable. One an account holds, including an invitee who signed up while it was held, is
 * answered in-app and gets no link. Each mail names the invitation's inviter, whoever publishes.
 */
export async function dispatchDeferredInvites(ctx: OrgContext, { channelIds }: DispatchDeferredInvitesOpts) {
  const pendingRows = await findPendingInactiveMembershipsByChannels(ctx, { channelIds });
  const heldRows = pendingRows.filter((row) => !row.remindedAt);
  if (!heldRows.length) return { dispatched: 0 };

  // Group per context+role+inviter: each email batch shares entityName, role and sender
  const groups = new Map<string, typeof heldRows>();
  for (const row of heldRows) {
    const key = `${row.channelType}:${row.channelId}:${row.role}:${row.createdBy}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  let dispatched = 0;

  for (const group of groups.values()) {
    const { channelType, channelId, role, createdBy } = group[0];
    const entity = await resolveEntity(ctx, { entityType: channelType, identifier: channelId });
    if (!entity) continue;

    // Rotate each link: fresh secret + expiry, replacing the invitation's earlier tokens
    const tokens = await issueTokens(
      ctx,
      group.flatMap((row) => (row.userId ? [] : [{ type: 'invitation' as const, email: row.email, createdBy, inactiveMembershipId: row.id }])),
    );
    const linkById = new Map(tokens.map(({ token, rawToken }) => [token.inactiveMembershipId, rawToken]));

    await sendInvitationMails(ctx, {
      sender: await findUserById(ctx, { id: createdBy }),
      channel: { type: channelType, slug: entity.slug, name: entity.name, role },
      organization: ctx.var.organization,
      invited: group.map((row) => ({ email: row.email, userId: row.userId, rawToken: linkById.get(row.id) })),
    });

    // Stamped per group: a later group that fails leaves this one mailed once.
    await stampInactiveMembershipsReminded(ctx, { ids: group.map((row) => row.id), remindedAt: getIsoDate() });
    dispatched += group.length;
  }

  log.info('Deferred invites dispatched', { count: dispatched, contexts: channelIds.length });

  return { dispatched };
}
