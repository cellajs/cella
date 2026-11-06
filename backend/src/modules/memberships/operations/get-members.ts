import type { z } from '@hono/zod-openapi';
import type { UserContext } from '#/core/context';
import { tenantRead } from '#/db/tenant-context';
import { membershipAsSeenBy } from '#/modules/memberships/helpers/select';
import { findMembersPaginated } from '#/modules/memberships/memberships-queries';
import type { memberListQuerySchema } from '#/modules/memberships/memberships-schema';
import { administeredOrganizationIds } from '#/permissions/administered-organizations';
import { getValidChannel } from '#/permissions/get-valid-channel';
import type { PageWindow } from '#/utils/list-page';

type GetMembersInput = z.infer<typeof memberListQuerySchema>;

/**
 * A page of a channel's members for anyone who may read it, each membership as the caller may see it. `include` adds
 * per-member counts (`counts`) and, for the organization's admins only, each member's MFA switch (`mfa`).
 */
export async function getMembersOp(ctx: UserContext, input: GetMembersInput, { offset, limit }: PageWindow) {
  const { include, orderBy, entityId, entityType, q, role, userIds } = input;
  const { entity } = await getValidChannel(ctx, entityId, entityType, 'read');

  const includeCounts = include.includes('counts');
  // The organization's admins alone: to any member, the list would name the accounts without a second factor.
  const includeMfa = include.includes('mfa') && administeredOrganizationIds(ctx, [ctx.var.organization.id]).length > 0;
  const listOpts = {
    ...orderBy,
    entityType,
    q,
    role,
    userIds,
    offset,
    limit,
    organizationId: ctx.var.organization.id,
    entityId: entity.id,
    includeCounts,
    includeMfa,
  };

  // Member counts and the lastPostedAt sort read RLS-guarded product tables,
  // which read empty on this route's bare baseDb; tenantGuard pinned the tenant, so read as it.
  const { items, total } =
    includeCounts || orderBy.sort === 'lastPostedAt'
      ? await tenantRead(ctx, (readCtx) => findMembersPaginated(readCtx, listOpts))
      : await findMembersPaginated(ctx, listOpts);

  const callerId = ctx.var.user.id;
  const projected = items.map((item) => ({ ...item, membership: membershipAsSeenBy(item.membership, callerId) }));

  return { items: projected, total };
}
