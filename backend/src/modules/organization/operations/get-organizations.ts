import { type EntityRole, hierarchy } from 'shared';
import type { AuthContext } from '#/core/context';
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

export async function getOrganizationsOp(ctx: AuthContext, input: GetOrganizationsInput) {
  const user = ctx.var.user;
  const memberships = ctx.var.memberships;
  const { q, sort, order, offset, limit, relatableUserId, role, excludeArchived, include } = input;

  const entityType = 'organization';
  const isSystemAdmin = ctx.var.isSystemAdmin && !relatableUserId;

  // relatableGuard already verified shared org membership if relatableUserId is provided
  const targetUserId = relatableUserId ?? user.id;

  const includeCounts = include.includes('counts');
  const includeMembership = include.includes('membership');
  const includeMembers = include.includes('members');

  const opts = { isSystemAdmin, targetUserId, q, sort, order, offset, limit, excludeArchived, role, includeCounts };
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
