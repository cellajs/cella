import type { ChannelEntityType } from 'shared';
import type { UserContext } from '#/core/context';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { deleteMembershipsByIds, findMembershipsByUserIdsAndChannel } from '#/modules/memberships/memberships-queries';
import { getValidChannel } from '#/permissions';
import { buildSubjectFromEntity } from '#/permissions/build-subject';
import { assertRoleGrant } from '#/permissions/role-grant';
import { log } from '#/utils/logger';

interface DeleteMembershipsInput {
  userIds: string[];
  entityId: string;
  entityType: ChannelEntityType;
}

/**
 * Deletes the channel's memberships of these users, which needs `delete` on it; a user id without one comes back rejected.
 * @throws AppError 403 `role_exceeds_actor` when one of them outranks the actor (`assertRoleGrant`): nobody is removed.
 */
export async function deleteMembershipsOp(ctx: UserContext, input: DeleteMembershipsInput) {
  const { userIds, entityId, entityType } = input;

  const { entity } = await getValidChannel(ctx, entityId, entityType, 'delete');

  const targets = await findMembershipsByUserIdsAndChannel(ctx, { userIds, channelId: entity.id });
  const rejectedIds = userIds.filter((id) => !targets.some((target) => target.userId === id));

  // Removing a member is refused where granting their role would be.
  const subject = buildSubjectFromEntity(entityType, entity);
  for (const target of targets) assertRoleGrant(ctx, { subject, role: target.role, action: 'delete' });

  if (targets.length) {
    await deleteMembershipsByIds(ctx, { ids: targets.map((target) => target.id) });
    for (const target of targets) invalidateCache.user(target.userId);
    log.info('Memberships deleted', { count: targets.length, userIds: targets.map((target) => target.userId) });
  }

  return { data: [], rejectedIds };
}
