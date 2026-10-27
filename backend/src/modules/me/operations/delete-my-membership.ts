import type { ChannelEntityType } from 'shared';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { deleteMyMembership } from '#/modules/me/me-queries';
import { log } from '#/utils/logger';

/**
 * Ends the user's membership of one channel.
 * @throws AppError 404 `not_found` when the user holds no membership there, whether or not the channel exists.
 */
export async function deleteMyMembershipOp(ctx: UserContext, channelType: ChannelEntityType, channelId: string) {
  // A channel the user is no member of answers as a missing one: a 204 would confirm that the id exists.
  const deleted = await deleteMyMembership(ctx, { userId: ctx.var.user.id, channelType, channelId });
  if (!deleted) throw new AppError(404, 'not_found', 'warn', { entityType: channelType });

  invalidateCache.user(ctx.var.user.id);
  log.info('User left channel');
}
