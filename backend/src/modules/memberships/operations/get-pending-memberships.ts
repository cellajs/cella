import type { ChannelEntityType } from 'shared';
import type { AuthContext } from '#/core/context';
import { getPendingMembershipsList } from '#/modules/memberships/memberships-queries';
import { withAuditUsers } from '#/modules/user/helpers/audit-user';
import { getValidChannelEntity } from '#/permissions/get-channel-entity';

interface GetPendingMembershipsInput {
  entityId: string;
  entityType: ChannelEntityType;
  sort?: 'createdAt';
  order?: 'asc' | 'desc';
  offset: number;
  limit: number;
}

export async function getPendingMembershipsOp(ctx: AuthContext, input: GetPendingMembershipsInput) {
  const organization = ctx.var.organization;

  const { entityId, entityType, sort, order, offset, limit } = input;
  const { entity } = await getValidChannelEntity(ctx, entityId, entityType, 'read');

  const { rawItems, total } = await getPendingMembershipsList(ctx, {
    organizationId: organization.id,
    entityId: entity.id,
    sort,
    order,
    offset,
    limit,
  });

  const items = await withAuditUsers(ctx, rawItems);

  return { items, total };
}
