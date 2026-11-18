import type { z } from '@hono/zod-openapi';
import { buildPeopleSubject, checkAccess, hierarchy } from 'shared';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { withActorRefs } from '#/modules/actors/actor-refs';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import { toMembershipBase } from '#/modules/memberships/helpers/select';
import { findMemberPreviewsByChannels, findOrganizationIdsWhereSeen } from '#/modules/memberships/memberships-queries';
import { findOrganizationsPaginated } from '#/modules/organization/organization-queries';
import type { organizationListQuerySchema } from '#/modules/organization/organization-schema';
import { listedTenantKinds } from '#/modules/tenants/tenant-restrictions';
import { accessFrom } from '#/permissions/access';
import type { UserMinimalBase } from '#/schemas/minimal-base';
import type { PageWindow } from '#/utils/list-page';

/**
 * A page of the caller's organizations, or with `memberUserId` of that user's, limited to the ones where the caller
 * sees them unless the caller is a system admin. Without `memberUserId` a system admin lists every organization.
 * `include=members` previews the admins of each organization whose people the caller reads.
 * @throws 403 `forbidden` when `role` or `excludeHidden` filters another user's list, and with `entityType: 'user'` for
 * a user the caller does not see anywhere, missing and unseen alike.
 */
export async function getOrganizationsOp(ctx: UserContext, input: z.infer<typeof organizationListQuerySchema>, { offset, limit }: PageWindow) {
  const { user, memberships } = ctx.var;
  const { q, orderBy, memberUserId, role, excludeHidden, include, kind } = input;
  const { sort, order } = orderBy;

  const entityType = 'organization';
  const isSystemAdmin = ctx.var.isSystemAdmin && !memberUserId;

  const targetUserId = memberUserId ?? user.id;
  const ofAnotherUser = !!memberUserId && memberUserId !== user.id;
  // Another user's organizations are listed only where the caller sees them; a system admin sees all of them.
  const whereCallerSeesUser =
    ofAnotherUser && !ctx.var.isSystemAdmin ? await findOrganizationIdsWhereSeen(ctx, { userId: memberUserId, access: accessFrom(ctx) }) : undefined;
  // One answer for a missing user and an unseen one: it never tells whether a user exists.
  if (whereCallerSeesUser?.length === 0) throw new AppError(403, 'forbidden', 'warn', { entityType: 'user' });

  // The listed user's hidden rows and role are theirs alone: as a filter on another user's list they are refused, never
  // dropped. The menu-order default names the caller's own menu, so another user's list comes by name.
  if (ofAnotherUser && (role || excludeHidden)) {
    throw new AppError(403, 'forbidden', 'warn', { entityType: 'organization', meta: { reason: 'other_user_membership' } });
  }

  const includeCounts = include.includes('counts');
  const includeMembership = include.includes('membership');
  const includeMembers = include.includes('members');

  const { items: organizations, total } = await findOrganizationsPaginated(ctx, {
    isSystemAdmin,
    targetUserId,
    organizationIds: whereCallerSeesUser,
    q,
    sort: ofAnotherUser && sort === 'displayOrder' ? ('name' as const) : sort,
    order,
    offset,
    limit,
    excludeHidden,
    role,
    // The kind filter is for the list across tenants: a member's own list holds whatever they belong to.
    tenantKinds: isSystemAdmin ? (kind.length ? kind : listedTenantKinds()) : undefined,
    includeCounts,
  });

  const access = accessFrom(ctx);
  const memberPreviews = includeMembers
    ? await findMemberPreviewsByChannels(ctx, {
        channelType: entityType,
        channelIds: organizations.filter((org) => checkAccess(access, 'read', buildPeopleSubject(entityType, org)).allowed).map((org) => org.id),
        role: hierarchy.getRoles(entityType)[0],
        limit: 3,
      })
    : null;

  const items = organizations.map((org) => {
    const { counts, ...orgData } = org;

    const included: { membership?: MembershipBaseModel; counts?: typeof counts; members?: UserMinimalBase[] } = {};

    if (includeMembership) {
      const membership = memberships.find((candidate) => candidate.channelType === entityType && candidate.organizationId === org.id);
      if (membership) included.membership = toMembershipBase(membership);
    }

    if (includeCounts && counts) included.counts = counts;

    if (memberPreviews) included.members = memberPreviews.get(org.id) ?? [];

    return { ...orgData, included };
  });

  return { items: await withActorRefs(ctx, items), total };
}
