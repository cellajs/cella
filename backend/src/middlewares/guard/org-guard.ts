import { and, eq } from 'drizzle-orm';
import { AppError } from '#/core/error';
import { xMiddleware } from '#/core/x-middleware';
import { withOrganizationDefaults } from '#/modules/organization/helpers/select';
import { organizationsTable } from '#/modules/organization/organization-db';
import { getOrgCache, setOrgCache } from './org-cache';

/** Grants org-scoped routes to org members and system admins. Must run after tenantGuard for the RLS transaction. */
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

    if (!db) {
      throw new AppError(500, 'server_error', 'error', { message: 'orgGuard requires tenantGuard middleware' });
    }

    if (memberships === undefined) {
      throw new AppError(500, 'server_error', 'error', { message: 'orgGuard requires isAuthenticated middleware' });
    }

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
    const organization = withOrganizationDefaults(orgRow);

    // Second check beside RLS: the organization must belong to the current tenant
    if (organization.tenantId !== tenantId) {
      throw new AppError(403, 'forbidden', 'warn', { entityType: 'organization' });
    }

    const orgMembership =
      memberships.find((m) => m.organizationId === organization.id && m.channelType === 'organization') || null;
    if (!isSystemAdmin && !orgMembership) {
      throw new AppError(403, 'forbidden', 'warn', { entityType: 'organization' });
    }
    const orgWithMembership = { ...organization, membership: orgMembership };

    // membership is null for system admins
    ctx.set('organization', orgWithMembership);
    ctx.set('organizationId', orgWithMembership.id);

    await next();
  },
);
