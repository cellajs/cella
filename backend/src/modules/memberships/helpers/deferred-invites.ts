import { appConfig, type ChannelEntityType } from 'shared';
import { nanoid } from 'shared/utils/nanoid';
import type { AuthContext } from '#/core/context';
import { mailer } from '#/lib/mailer';
import { resolveEntity } from '#/modules/entities/entities-queries';
import {
  findPendingInactiveMembershipsByChannels,
  insertTokens,
  stampInactiveMembershipsReminded,
  updateInactiveMembershipToken,
} from '#/modules/memberships/memberships-queries';
import { log } from '#/utils/logger';
import { encodeLowerCased } from '#/utils/oslo';
import { slugFromEmail } from '#/utils/slug-from-email';
import { createDate, TimeSpan } from '#/utils/time-span';
import { memberInviteEmail, memberInviteWithTokenEmail } from '../../../../emails';

interface DispatchDeferredInvitesOpts {
  /** Channel entity ids whose pending invites should be dispatched (e.g. a published course + descendants). */
  channelIds: string[];
}

/**
 * Dispatch invites that were deferred while their context was unpublished: send the held
 * emails through the normal invitation flow and stamp `remindedAt`. Invitation tokens are
 * rotated (fresh secret + expiry) since raw tokens are unrecoverable and may have expired
 * while the context was a draft. The active re-invite throttle skips rows emailed within
 * the last seven days.
 */
export async function dispatchDeferredInvites(ctx: AuthContext, { channelIds }: DispatchDeferredInvitesOpts) {
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
    const entity = await resolveEntity(ctx, channelType as ChannelEntityType, channelId);
    if (!entity) continue;

    const staticProps = { senderName, senderThumbnailUrl, role, entityName: entity.name };
    const entityLink = `${appConfig.frontendUrl}/${channelType}/${entity.slug}`;

    const withTokenRecipients: Array<{ email: string; lng: string; name: string; inviteLink: string }> = [];
    const noTokenRecipients: Array<{ email: string; lng: string; name: string; memberInviteLink: string }> = [];

    for (const row of group) {
      if (row.tokenId) {
        // Rotate the invitation token: fresh secret + expiry, re-pointed from the invite row
        const raw = nanoid(40);
        const [token] = await insertTokens(ctx, {
          tokens: [
            {
              secret: encodeLowerCased(raw),
              type: 'invitation' as const,
              email: row.email,
              createdBy: row.createdBy,
              expiresAt: createDate(new TimeSpan(7, 'd')),
              inactiveMembershipId: row.id,
            },
          ],
        });
        await updateInactiveMembershipToken(ctx, { id: row.id, tokenId: token.id });

        withTokenRecipients.push({
          email: row.email,
          lng,
          name: slugFromEmail(row.email),
          inviteLink: `${appConfig.backendAuthUrl}/invoke-token/invitation/${raw}`,
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
