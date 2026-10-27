import type { ChannelEntityType } from 'shared';
import type { UserContext } from '#/core/context';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { deleteMembershipsByIds, findMembershipsByUserIdsAndChannel } from '#/modules/memberships/memberships-queries';
import { getValidChannel } from '#/permissions/get-valid-channel';
import { log } from '#/utils/logger';

interface DeleteMembershipsInput {
  ids: string[];
  entityId: string;
  entityType: ChannelEntityType;
}

export async function deleteMembershipsOp(ctx: UserContext, input: DeleteMembershipsInput) {
  const { ids, entityId, entityType } = input;

  const { entity } = await getValidChannel(ctx, entityId, entityType, 'delete');

  const targets = await findMembershipsByUserIdsAndChannel(ctx, { userIds: ids, channelId: entity.id });
  const rejectedIds = ids.filter((id) => !targets.some((target) => target.userId === id));

  if (targets.length) {
    await deleteMembershipsByIds(ctx, { ids: targets.map((target) => target.id) });
    for (const target of targets) invalidateCache.user(target.userId);
    log.info('Memberships deleted', { count: targets.length, ids: targets.map((t) => t.userId) });
  }

  return { data: [], rejectedIds };
}
