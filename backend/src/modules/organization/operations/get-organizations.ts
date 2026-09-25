import { type EntityRole, hierarchy } from 'shared';
import type { UserContext } from '#/core/context';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import { toMembershipBase } from '#/modules/memberships/helpers/select';
import { findMemberPreviewsByChannels } from '#/modules/memberships/memberships-queries';
import { findOrganizationsPaginated } from '#/modules/organization/organization-queries';
import type { UserMinimalBase } from '#/modules/user/helpers/audit-user';
import { coalesceAuditUsers } from '#/modules/user/helpers/audit-user';

interface GetOrganizationsInput {
  q?: string;
  sort?: 'id' | 'name' | 'createdAt' | 'userRole' | 'displayOrder';
  order?: 'asc' | 'desc';
  offset: number;
  limit: number;
  relatableUserId?: string;
  role?: EntityRole;
  excludeArchived?: boolean;
  include: string[];
}

export async function getOrganizationsOp(ctx: UserContext, input: GetOrganizationsInput) {
  const user = ctx.var.user;
  const memberships = ctx.var.memberships;
  const { q, sort, order, offset, limit, relatableUserId, role, excludeArchived, include } = input;

  const entityType = 'organization';
  const isSystemAdmin = ctx.var.isSystemAdmin && !relatableUserId;

  // relatableGuard already verified shared org membership if relatableUserId is provided
  const targetUserId = relatableUserId ?? user.id;
  const ofAnotherUser = !!relatableUserId && relatableUserId !== user.id;
  // Another user's organizations are listed only where the caller is a member too; a system admin sees all of them.
  const sharedWithCaller =
    ofAnotherUser && !ctx.var.isSystemAdmin ? [...new Set(memberships.map((m) => m.organizationId))] : undefined;

  const includeCounts = include.includes('counts');
  const includeMembership = include.includes('membership');
  const includeMembers = include.includes('members');

  // Archive, role and menu order are read from the listed user's memberships: for another user's list none applies,
  // and a menu-order sort falls back to name.
  const opts = {
    isSystemAdmin,
    targetUserId,
    organizationIds: sharedWithCaller,
    q,
    sort: ofAnotherUser && (!sort || sort === 'displayOrder') ? ('name' as const) : sort,
    order,
    offset,
    limit,
    excludeArchived: ofAnotherUser ? undefined : excludeArchived,
    role: ofAnotherUser ? undefined : role,
    includeCounts,
  };
  const { items: organizations, total } = await findOrganizationsPaginated(ctx, opts);

  // Member previews: one batched query per page for the most-privileged role, capped at 3 per entity; overflow counts come from the m:{role} counters.
  const memberPreviews = includeMembers
    ? await findMemberPreviewsByChannels(ctx, {
        channelType: entityType,
        channelIds: organizations.map((org) => org.id),
        role: hierarchy.getRoles(entityType)[0],
        limit: 3,
      })
    : null;

  const items = organizations.map((org) => {
    const { counts, ...orgData } = org;

    const included: { membership?: MembershipBaseModel; counts?: typeof counts; members?: UserMinimalBase[] } = {};

    if (includeMembership) {
      const membership = memberships.find((m) => m.channelType === entityType && m.organizationId === org.id);
      if (membership) included.membership = toMembershipBase(membership);
    }

    if (includeCounts && counts) included.counts = counts;

    if (memberPreviews) included.members = memberPreviews.get(org.id) ?? [];

    return { ...orgData, included };
  });

  return { items: coalesceAuditUsers(items), total };
}
