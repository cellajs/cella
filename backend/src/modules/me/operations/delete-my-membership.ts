import type { ChannelEntityType } from 'shared';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { deleteMyMembership } from '#/modules/me/me-queries';
import { log } from '#/utils/logger';

export async function deleteMyMembershipOp(ctx: UserContext, entityType: ChannelEntityType, entityId: string) {
  // A channel the user is no member of answers as a missing one: a 204 would confirm that the id exists.
  const deleted = await deleteMyMembership(ctx, { userId: ctx.var.user.id, channelType: entityType, channelId: entityId });
  if (!deleted) throw new AppError(404, 'not_found', 'warn', { entityType });

  invalidateCache.user(ctx.var.user.id);
  log.info('User left entity');
}
