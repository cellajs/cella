import type { ChannelEntityType, EntityRole } from 'shared';
import type { AuthContext } from '#/core/context';
import { tenantRead } from '#/db/tenant-context';
import { findMembersPaginated } from '#/modules/memberships/memberships-queries';
import { getValidChannel } from '#/permissions/get-valid-channel';

interface GetMembersInput {
  entityId: string;
  entityType: ChannelEntityType;
  q?: string;
  sort?: 'id' | 'name' | 'email' | 'createdAt' | 'lastSeenAt' | 'role' | 'lastPostedAt';
  order?: 'asc' | 'desc';
  offset: number;
  limit: number;
  role?: EntityRole;
  userIds?: string[];
  // Opt-in per-member insight counts
  include?: string[];
}

export async function getMembersOp(ctx: AuthContext, input: GetMembersInput) {
  const organization = ctx.var.organization;

  const { entityId, entityType, q, sort, order, offset, limit, role, userIds, include } = input;

  const { entity } = await getValidChannel(ctx, entityId, entityType, 'read');

  const includeCounts = include?.includes('counts') ?? false;

  const listOpts = {
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
    includeCounts,
  };

  // Member counts and the lastPostedAt sort read RLS-guarded product tables,
  // which read empty on this route's bare baseDb; tenantGuard pinned the tenant, so read as it.
  const { items, total } =
    includeCounts || sort === 'lastPostedAt'
      ? await tenantRead(ctx, (readCtx) => findMembersPaginated(readCtx, listOpts))
      : await findMembersPaginated(ctx, listOpts);

  return { items, total };
}
