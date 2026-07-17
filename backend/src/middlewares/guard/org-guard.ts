import { and, eq } from 'drizzle-orm';
import { AppError } from '#/core/error';
import { xMiddleware } from '#/core/x-middleware';
import { withOrganizationFlagDefaults } from '#/modules/organization/helpers/select';
import { organizationsTable } from '#/modules/organization/organization-db';
import { getOrgCache, setOrgCache } from './org-cache';

/**
 * Middleware to ensure the user has access to an organization-scoped route.
 * Must run after tenantGuard to use tenant-scoped transaction with RLS.
 * Valid access for users that is a member of the organization or is a system admin.
 */
export const orgGuard = xMiddleware(
  {
    functionName: 'orgGuard',
    type: 'x-guard',
    name: 'org',
    description: 'Validates organization membership within tenant context',
  },
  async (ctx, next) => {
    const organizationId = ctx.req.param('organizationId');
    if (!organizationId)
      throw new AppError(400, 'invalid_request', 'error', { meta: { reason: 'Missing organizationId parameter' } });

    const db = ctx.var.db;
    const memberships = ctx.var.memberships;
    const isSystemAdmin = ctx.var.isSystemAdmin;
    const tenantId = ctx.var.tenantId;

    // Guard: tenantGuard must run before orgGuard to provide tenant-scoped db
    if (!db) {
      throw new AppError(500, 'server_error', 'error', { message: 'orgGuard requires tenantGuard middleware' });
    }

    // Guard: isAuthenticated must run before orgGuard to populate memberships
    if (memberships === undefined) {
      throw new AppError(500, 'server_error', 'error', { message: 'orgGuard requires isAuthenticated middleware' });
    }

    // Check org cache before hitting DB
    const cached = getOrgCache(tenantId, organizationId);
    const orgRow =
      cached ??
      (await (async () => {
        const [row] = await db
          .select()
          .from(organizationsTable)
          .where(and(eq(organizationsTable.id, organizationId), eq(organizationsTable.tenantId, tenantId)));
        if (row) setOrgCache(tenantId, organizationId, row);
        return row;
      })());
    if (!orgRow) throw new AppError(404, 'not_found', 'warn', { entityType: 'organization' });

    // Rows store organizationFlags sparse; merge config defaults under the stored bag
    const organization = withOrganizationFlagDefaults(orgRow);

    // Sanity check apart from RLS: Verify organization belongs to current tenant
    if (organization.tenantId !== tenantId) {
      throw new AppError(403, 'forbidden', 'warn', { entityType: 'organization' });
    }

    // Check if user has access to organization (or is a system admin)
    const orgMembership =
      memberships.find((m) => m.organizationId === organization.id && m.channelType === 'organization') || null;
    if (!isSystemAdmin && !orgMembership) {
      throw new AppError(403, 'forbidden', 'warn', { entityType: 'organization' });
    }
    const orgWithMembership = { ...organization, membership: orgMembership };

    // Set organization with membership (can be null for system admins!) in context
    ctx.set('organization', orgWithMembership);
    ctx.set('organizationId', orgWithMembership.id);

    await next();
  },
);
