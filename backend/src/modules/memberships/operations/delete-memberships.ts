import type { ChannelEntityType } from 'shared';
import type { AuthContext } from '#/core/context';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { deleteMembershipsByIds, findMembershipsByUserIdsAndChannel } from '#/modules/memberships/memberships-queries';
import { getValidChannelEntity } from '#/permissions/get-channel-entity';
import { log } from '#/utils/logger';

interface DeleteMembershipsInput {
  ids: string[];
  entityId: string;
  entityType: ChannelEntityType;
}

export async function deleteMembershipsOp(ctx: AuthContext, input: DeleteMembershipsInput) {
  const { ids, entityId, entityType } = input;

  const { entity } = await getValidChannelEntity(ctx, entityId, entityType, 'delete');

  const membershipIds = Array.isArray(ids) ? ids : [ids];

  const targets = await findMembershipsByUserIdsAndChannel(ctx, {
    userIds: membershipIds,
    channelId: entity.id,
  });

  const rejectedIds: string[] = [];

  for (const id of membershipIds) {
    if (!targets.some((target) => target.userId === id)) rejectedIds.push(id);
  }

  if (targets.length === 0) return { data: [] as never[], rejectedIds };

  await deleteMembershipsByIds(ctx, {
    ids: targets.map((target) => target.id),
  });

  for (const target of targets) invalidateCache.user(target.userId);

  log.info('Memberships deleted', { count: targets.length, ids: targets.map((t) => t.userId) });

  return { data: [] as never[], rejectedIds };
}
