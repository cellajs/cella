import type { DbContext } from '#/core/context';
import type { UserId } from '#/db/utils/ids';
import { releaseHeldInvitations } from '#/modules/memberships/invitations-queries';
import { mailInvitations } from '#/modules/memberships/operations/mail-invitations';
import { log } from '#/utils/logger';

interface DispatchDeferredInvitesOpts {
  /** The channels whose held invitations go out: a published channel and its descendants. */
  channelIds: string[];
  /** The channels' organization: the language a mail to an address without an account takes, and the name a mail gives. */
  organization: { defaultLanguageCode: string; name: string };
  /** Who published. */
  by: UserId;
}

/**
 * Sends the invitations held while their channel was unpublished. Their release to pending and its mail are one
 * claim: a second publish call finds none held, and one whose mail failed waits as pending for a resend. An invitation
 * no account holds gets its first link here (`mailInvitations`).
 */
export async function dispatchDeferredInvites(ctx: DbContext, { channelIds, organization, by }: DispatchDeferredInvitesOpts) {
  const released = await releaseHeldInvitations(ctx, { channelIds, by });
  if (!released.length) return { dispatched: 0 };

  const mailed = await mailInvitations(ctx, { ids: released.map(({ id }) => id), organization, by });

  log.info('Deferred invites dispatched', { count: mailed.length, channels: channelIds.length });

  return { dispatched: mailed.length };
}
