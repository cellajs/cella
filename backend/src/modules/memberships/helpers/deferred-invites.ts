import { appConfig, type ChannelEntityType } from 'shared';
import type { UserContext } from '#/core/context';
import { mailer } from '#/lib/mailer';
import { issueToken } from '#/modules/auth/tokens/token-lifecycle';
import { resolveEntity } from '#/modules/entities/entities-queries';
import {
  findPendingInactiveMembershipsByChannels,
  stampInactiveMembershipsReminded,
  updateInactiveMembershipToken,
} from '#/modules/memberships/memberships-queries';
import { log } from '#/utils/logger';
import { slugFromEmail } from '#/utils/slug-from-email';
import { memberInviteEmail, memberInviteWithTokenEmail } from '../../../../emails';

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

  const lng = appConfig.defaultLanguage;
  const senderName = user.name;
  const senderThumbnailUrl = user.thumbnailUrl;

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

    const staticProps = { senderName, senderThumbnailUrl, role, entityName: entity.name };
    const entityLink = `${appConfig.frontendUrl}/${channelType}/${entity.slug}`;

    const withTokenRecipients: Array<{ email: string; lng: string; name: string; inviteLink: string }> = [];
    const noTokenRecipients: Array<{ email: string; lng: string; name: string; memberInviteLink: string }> = [];

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

        withTokenRecipients.push({
          email: row.email,
          lng,
          name: slugFromEmail(row.email),
          inviteLink: `${appConfig.backendAuthUrl}/invoke-token/invitation/${rawToken}`,
        });
      } else {
        noTokenRecipients.push({
          email: row.email,
          lng,
          name: slugFromEmail(row.email),
          memberInviteLink: entityLink,
        });
      }
      dispatchedIds.push(row.id);
    }

    if (withTokenRecipients.length > 0) {
      await mailer.prepareEmails(memberInviteWithTokenEmail, staticProps, withTokenRecipients, user.email);
    }
    if (noTokenRecipients.length > 0) {
      await mailer.prepareEmails(memberInviteEmail, staticProps, noTokenRecipients, user.email);
    }
  }

  await stampInactiveMembershipsReminded(ctx, { ids: dispatchedIds, remindedAt: new Date().toISOString() });

  log.info('Deferred invites dispatched', { count: dispatchedIds.length, contexts: channelIds.length });

  return { dispatched: dispatchedIds.length };
}
