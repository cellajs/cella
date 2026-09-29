import type { ChannelEntityType } from 'shared';
import type { UserContext } from '#/core/context';
import { issueToken } from '#/modules/auth/tokens/token-lifecycle';
import { resolveEntity } from '#/modules/entities/entities-queries';
import { type InvitedAddress, sendInvitationMails } from '#/modules/memberships/helpers/invitation-mail';
import {
  findPendingInactiveMembershipsByChannels,
  stampInactiveMembershipsReminded,
  updateInactiveMembershipToken,
} from '#/modules/memberships/memberships-queries';
import { log } from '#/utils/logger';

interface DispatchDeferredInvitesOpts {
  /** Channel entity ids whose pending invites should be dispatched (e.g. a published course + descendants). */
  channelIds: string[];
}

/**
 * Sends invites held while their context was unpublished and stamps `remindedAt`. Invitation tokens are rotated
 * (fresh secret and expiry) because raw tokens are unrecoverable; the throttle skips rows emailed in the last seven days.
 */
export async function dispatchDeferredInvites(ctx: UserContext, { channelIds }: DispatchDeferredInvitesOpts) {
  const user = ctx.var.user;

  const pendingRows = await findPendingInactiveMembershipsByChannels(ctx, { channelIds });

  // 7-day throttle on last dispatch; deferred rows have remindedAt null → always due
  const throttleBefore = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const dueRows = pendingRows.filter((row) => !row.remindedAt || new Date(row.remindedAt) < throttleBefore);
  if (!dueRows.length) return { dispatched: 0 };

  // Group per context+role: each email batch shares entityName + role static props
  const groups = new Map<string, typeof dueRows>();
  for (const row of dueRows) {
    const key = `${row.channelType}:${row.channelId}:${row.role}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  const dispatchedIds: string[] = [];

  for (const group of groups.values()) {
    const { channelType, channelId, role } = group[0];
    const entity = await resolveEntity(ctx, {
      entityType: channelType as ChannelEntityType,
      identifier: channelId,
    });
    if (!entity) continue;

    const invited: InvitedAddress[] = [];

    for (const row of group) {
      if (row.tokenId) {
        // Rotate the invitation token: fresh secret + expiry, re-pointed from the invite row
        const { token, rawToken } = await issueToken(ctx, {
          type: 'invitation',
          email: row.email,
          createdBy: row.createdBy,
          inactiveMembershipId: row.id,
        });
        await updateInactiveMembershipToken(ctx, { id: row.id, tokenId: token.id });
        invited.push({ email: row.email, rawToken });
      } else {
        invited.push({ email: row.email, userId: row.userId });
      }
      dispatchedIds.push(row.id);
    }

    await sendInvitationMails(ctx, {
      sender: user,
      channel: { type: channelType as ChannelEntityType, slug: entity.slug, name: entity.name, role },
      organization: ctx.var.organization,
      invited,
    });
  }

  await stampInactiveMembershipsReminded(ctx, { ids: dispatchedIds, remindedAt: new Date().toISOString() });

  log.info('Deferred invites dispatched', { count: dispatchedIds.length, contexts: channelIds.length });

  return { dispatched: dispatchedIds.length };
}
