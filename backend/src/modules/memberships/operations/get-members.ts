import type { ChannelEntityType, EntityRole } from 'shared';
import type { UserContext } from '#/core/context';
import { tenantRead } from '#/db/tenant-context';
import { membershipAsSeenBy } from '#/modules/memberships/helpers/select';
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

export async function getMembersOp(ctx: UserContext, input: GetMembersInput) {
  const { include, ...query } = input;
  const { entity } = await getValidChannel(ctx, query.entityId, query.entityType, 'read');

  const includeCounts = include?.includes('counts') ?? false;
  const listOpts = { ...query, organizationId: ctx.var.organization.id, entityId: entity.id, includeCounts };

  // Member counts and the lastPostedAt sort read RLS-guarded product tables,
  // which read empty on this route's bare baseDb; tenantGuard pinned the tenant, so read as it.
  const { items, total } =
    includeCounts || query.sort === 'lastPostedAt'
      ? await tenantRead(ctx, (readCtx) => findMembersPaginated(readCtx, listOpts))
      : await findMembersPaginated(ctx, listOpts);

  const callerId = ctx.var.user.id;
  const projected = items.map((item) => ({ ...item, membership: membershipAsSeenBy(item.membership, callerId) }));

  return { items: projected, total };
}
