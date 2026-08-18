import { and, eq } from 'drizzle-orm';
import { AppError } from '#/core/error';
import { xMiddleware } from '#/core/x-middleware';
import { withOrganizationDefaults } from '#/modules/organization/helpers/select';
import { organizationsTable } from '#/modules/organization/organization-db';
import { getOrgCache, setOrgCache } from './org-cache';

/**
 * Grants org-scoped routes to system admins and to anyone holding a membership inside the
 * organization, at organization level or in any channel below it. Must run after tenantGuard for
 * the RLS transaction.
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

    // Deeper channel rows carry organizationId as an ancestor column, so a sub-channel member is
    // in the org. This guard only rejects callers with no foothold at all; the permission engine
    // does the fine-grained work.
    const orgMembership =
      memberships.find((m) => m.organizationId === organization.id && m.channelType === 'organization') || null;
    const isInOrganization = orgMembership !== null || memberships.some((m) => m.organizationId === organization.id);
    if (!isSystemAdmin && !isInOrganization) {
      throw new AppError(403, 'forbidden', 'warn', { entityType: 'organization' });
    }
    const orgWithMembership = { ...organization, membership: orgMembership };

    // membership is the organization-level row: null for system admins, and for members who hold
    // rows only in channels below the organization
    ctx.set('organization', orgWithMembership);
    ctx.set('organizationId', orgWithMembership.id);

    await next();
  },
);
