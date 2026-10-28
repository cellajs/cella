import type { ChannelEntityType } from 'shared';
import type { UserContext } from '#/core/context';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { deleteMembershipsByIds, findMembershipsByUserIdsAndChannel } from '#/modules/memberships/memberships-queries';
import { getValidChannel } from '#/permissions';
import { log } from '#/utils/logger';

interface DeleteMembershipsInput {
  userIds: string[];
  entityId: string;
  entityType: ChannelEntityType;
}

/** Deletes the channel's memberships of these users, which needs `delete` on it; a user id without one comes back rejected. */
export async function deleteMembershipsOp(ctx: UserContext, input: DeleteMembershipsInput) {
  const { userIds, entityId, entityType } = input;

  const { entity } = await getValidChannel(ctx, entityId, entityType, 'delete');

  const targets = await findMembershipsByUserIdsAndChannel(ctx, { userIds, channelId: entity.id });
  const rejectedIds = userIds.filter((id) => !targets.some((target) => target.userId === id));

  if (targets.length) {
    await deleteMembershipsByIds(ctx, { ids: targets.map((target) => target.id) });
    for (const target of targets) invalidateCache.user(target.userId);
    log.info('Memberships deleted', { count: targets.length, userIds: targets.map((target) => target.userId) });
  }

  return { data: [], rejectedIds };
}
