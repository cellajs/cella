import { AppError } from '#/core/error';
import { xMiddleware } from '#/core/x-middleware';
import { baseDb } from '#/db/db';
import { findTenantById } from '#/db/prepared';
import { normalizeRestrictions } from '#/modules/tenants/tenant-restrictions';
import { getTenantCache, setTenantCache } from './tenant-cache';

/**
 * Guard middleware for authenticated tenant-scoped routes.
 * Validates tenant access and sets baseDb + tenant context for downstream handlers.
 * Organization resolution is handled by orgGuard middleware.
 */
export const tenantGuard = xMiddleware(
  {
    functionName: 'tenantGuard',
    type: 'x-guard',
    name: 'tenant',
    description: 'Requires authGuard, validates tenant access, and sets baseDb + tenantId context',
  },
  async (ctx, next) => {
    const rawTenantId = ctx.req.param('tenantId');

    if (!rawTenantId) {
      throw new AppError(400, 'invalid_request', 'error', { meta: { reason: 'Missing tenantId parameter' } });
    }

    const tenantId = rawTenantId.toLowerCase();

    const user = ctx.var.user;
    const memberships = ctx.var.memberships;
    const isSystemAdmin = ctx.var.isSystemAdmin;

    // Require authenticated user (this middleware is for authenticated routes)
    if (!user || memberships === undefined) {
      throw new AppError(401, 'unauthorized', 'warn', {
        message: 'tenantGuard requires authGuard middleware',
      });
    }

    // Verify user has access to this tenant (via membership) or is system admin
    const hasTenantMembership = memberships.some((m) => m.tenantId === tenantId);

    // Check tenant cache before hitting DB
    const cached = getTenantCache(tenantId);
    if (cached) {
      // Allow access if user created the tenant (bootstrap: no orgs/memberships yet)
      if (!isSystemAdmin && !hasTenantMembership && cached.createdBy !== user.id) {
        throw new AppError(403, 'forbidden', 'warn', { meta: { resource: 'tenant' } });
      }

      if (cached.status !== 'active') {
        throw new AppError(403, 'forbidden', 'warn', { message: `Tenant is ${cached.status}` });
      }

      ctx.set('db', baseDb);
      ctx.set('tenantId', tenantId);
      ctx.set('tenant', cached);

      return next();
    }

    const [tenant] = await findTenantById.execute({ id: tenantId });

    if (!tenant) {
      throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'tenant' } });
    }

    // Allow access if user created the tenant (bootstrap: no orgs/memberships yet)
    if (!isSystemAdmin && !hasTenantMembership && tenant.createdBy !== user.id) {
      throw new AppError(403, 'forbidden', 'warn', { meta: { resource: 'tenant' } });
    }

    // Normalize nullable restrictions against current defaults.
    tenant.restrictions = normalizeRestrictions(tenant.restrictions);

    if (tenant.status !== 'active') {
      throw new AppError(403, 'forbidden', 'warn', { message: `Tenant is ${tenant.status}` });
    }

    // TODO(sso): enforce tenant.authStrategies here. When the SSO build
    // lands, reject a session whose authStrategy is not in the tenant's allowed set (empty = all) with
    // `403 sso_required` + a redirect hint to the tenant entry URL; system admins exempt (break-glass).
    // The policy column remains inert until a tenant authorization path reads it.

    // Populate cache for subsequent requests
    setTenantCache(tenantId, tenant);

    // Handlers use tenantRead for product entity RLS reads.
    ctx.set('db', baseDb);
    ctx.set('tenantId', tenantId);
    ctx.set('tenant', tenant);

    await next();
  },
);
