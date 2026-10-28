import type { ActorBinding } from '#/core/context';
import { AppError } from '#/core/error';
import { xMiddleware } from '#/core/x-middleware';
import { missingRouteParam } from '#/middlewares/guard/route-target';
import { isMembershipRow } from '#/modules/memberships/helpers/select';
import { withOrganizationDefaults } from '#/modules/organization/helpers/select';
import { loadOrganization } from '#/modules/organization/load-organization';

/**
 * Grants org-scoped routes to system admins and to anyone holding a membership inside the
 * organization, at organization level or in any channel below it. A caller without one gets the
 * answer a missing organization gets, so an id is never confirmed.
 */
export const orgGuard = xMiddleware(
  {
    functionName: 'orgGuard',
    type: 'x-guard',
    errors: [404],
    requires: ['actor', 'tenant'],
    name: 'org',
    description: 'Requires being in the organization: a member of it or of a channel below it, or a system admin',
  },
  async (ctx, next) => {
    // Lowercased as the stored id is: the row is cached under the id `invalidateCache.org` drops.
    const organizationId = ctx.req.param('organizationId')?.toLowerCase();
    if (!organizationId) throw missingRouteParam('organizationId');

    const { isSystemAdmin, tenantId } = ctx.var;
    const bindings: readonly ActorBinding[] | undefined = ctx.var.actor?.bindings;

    if (!tenantId) {
      throw new AppError(500, 'server_error', 'error', { message: 'orgGuard requires tenantGuard middleware' });
    }

    if (bindings === undefined) {
      throw new AppError(500, 'server_error', 'error', { message: 'orgGuard requires userGuard or serviceGuard' });
    }

    const missing = () => new AppError(404, 'not_found', 'warn', { entityType: 'organization' });

    // The lookup is bound to the request's tenant, so an organization of another tenant does not resolve.
    const orgRow = await loadOrganization(ctx, { tenantId, organizationId });
    if (!orgRow) throw missing();

    // Rows store organizationFlags sparse; merge config defaults under the stored bag
    const organization = withOrganizationDefaults(orgRow);

    // Deeper channel rows carry organizationId as an ancestor column, so a sub-channel member is
    // in the org. This guard only rejects callers with no foothold at all; the permission engine
    // does the fine-grained work.
    const orgMembership = bindings.find((binding) => binding.organizationId === organization.id && binding.channelType === 'organization') ?? null;
    const isInOrganization = bindings.some((binding) => binding.organizationId === organization.id);
    if (!isSystemAdmin && !isInOrganization) throw missing();
    // A service account's binding is not a membership row; the organization-level membership is a user's only.
    const orgWithMembership = { ...organization, membership: orgMembership && isMembershipRow(orgMembership) ? orgMembership : null };

    // membership is the organization-level row: null for a system admin without one, and for members who hold rows only
    // in channels below the organization
    ctx.set('organization', orgWithMembership);
    ctx.set('organizationId', orgWithMembership.id);

    await next();
  },
);
