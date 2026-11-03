import type { OrgContext } from '#/core/context';
import { findPendingInactiveMembershipsByChannels } from '#/modules/memberships/inactive-memberships-queries';
import { mailInvitations } from '#/modules/memberships/operations/mail-invitations';
import { log } from '#/utils/logger';

interface DispatchDeferredInvitesOpts {
  /** The channels whose held invitations go out: a published channel and its descendants. */
  channelIds: string[];
}

/**
 * Sends the invitations held while their channel was unpublished: the ones whose mail never went out, which carry no
 * `remindedAt`. One mailed when it was made, or dispatched before, is left alone, so a publish flow may hand over a
 * channel again; one whose mail failed is still held for the next call. An invitation no account holds gets its first
 * link here (`mailInvitations`).
 */
export async function dispatchDeferredInvites(ctx: OrgContext, { channelIds }: DispatchDeferredInvitesOpts) {
  const pendingRows = await findPendingInactiveMembershipsByChannels(ctx, { channelIds });
  const heldIds = pendingRows.flatMap(({ id, remindedAt }) => (remindedAt ? [] : [id]));
  if (!heldIds.length) return { dispatched: 0 };

  const mailed = await mailInvitations(ctx, { ids: heldIds, organization: ctx.var.organization });

  log.info('Deferred invites dispatched', { count: mailed.length, channels: channelIds.length });

  return { dispatched: mailed.length };
}
