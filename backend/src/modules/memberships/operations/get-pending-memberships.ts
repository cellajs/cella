import type { ContextEntityType } from 'shared';
import type { AuthContext } from '#/core/context';
import { getPendingMembershipsList } from '#/modules/memberships/memberships-queries';
import { withAuditUsers } from '#/modules/user/helpers/audit-user';
import { getValidContextEntity } from '#/permissions/get-context-entity';

interface GetPendingMembershipsInput {
  entityId: string;
  entityType: ContextEntityType;
  sort?: 'createdAt';
  order?: 'asc' | 'desc';
  offset: number;
  limit: number;
}

export async function getPendingMembershipsOp(ctx: AuthContext, input: GetPendingMembershipsInput) {
  const organization = ctx.var.organization;

  const { entityId, entityType, sort, order, offset, limit } = input;
  const { entity } = await getValidContextEntity(ctx, entityId, entityType, 'read');

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
