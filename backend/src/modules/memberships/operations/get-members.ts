import type { ChannelEntityType, EntityRole } from 'shared';
import type { AuthContext } from '#/core/context';
import { getMembersList } from '#/modules/memberships/memberships-queries';
import { getValidChannelEntity } from '#/permissions/get-channel-entity';

interface GetMembersInput {
  entityId: string;
  entityType: ChannelEntityType;
  q?: string;
  sort?: 'id' | 'name' | 'email' | 'createdAt' | 'lastSeenAt' | 'role';
  order?: 'asc' | 'desc';
  offset: number;
  limit: number;
  role?: EntityRole;
  userIds?: string;
}

export async function getMembersOp(ctx: AuthContext, input: GetMembersInput) {
  const organization = ctx.var.organization;

  const { entityId, entityType, q, sort, order, offset, limit, role, userIds } = input;

  const { entity } = await getValidChannelEntity(ctx, entityId, entityType, 'read');

  const { items, total } = await getMembersList(ctx, {
    organizationId: organization.id,
    entityId: entity.id,
    entityType,
    q,
    sort,
    order,
    offset,
    limit,
    role,
    userIds,
  });

  return { items, total };
}
