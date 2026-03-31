/**
 * Middleware to ensure tenant-scoped access for authenticated routes.
 *
 * This middleware:
 * 1. Extracts tenantId from URL path
 * 2. Normalizes tenant ID to lowercase
 * 3. Verifies user has membership in this tenant (or is system admin)
 * 4. Sets ctx.var.db = baseDb (handlers use tenantRead for product entity RLS reads)
 * 5. Sets tenant context (tenantId, tenant row)
 *
 * @see info/ARCHITECTURE.md for architecture documentation
 */

import { baseDb } from '#/db/db';
import { findTenantById } from '#/db/prepared';
import { normalizeRestrictions } from '#/db/utils/tenant-restrictions';
import { xMiddleware } from '#/docs/x-middleware';
import { AppError } from '#/lib/error';
import { getTenantCache, setTenantCache } from './tenant-cache';

/**
 * Guard middleware for authenticated tenant-scoped routes.
 * Validates tenant access and sets baseDb + tenant context for downstream handlers.
 * Organization resolution is handled by orgGuard middleware.
 *
 * @param ctx - Request/response context with tenantId URL parameter
 * @param next - The next middleware or route handler
 * @returns Error response or continues to next handler with tenant context set
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
    if (!isSystemAdmin && !hasTenantMembership) {
      throw new AppError(403, 'forbidden', 'warn', { meta: { resource: 'tenant' } });
    }

    // Check tenant cache before hitting DB
    const cached = getTenantCache(tenantId);
    if (cached) {
      if (cached.status !== 'active') {
        throw new AppError(403, 'forbidden', 'warn', { message: `Tenant is ${cached.status}` });
      }

      ctx.set('db', baseDb);
      ctx.set('tenantId', tenantId);
      ctx.set('tenant', cached);

      return next();
    }

    // Cache miss — load tenant row from DB
    const [tenant] = await findTenantById.execute({ id: tenantId });

    if (!tenant) {
      throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'tenant' } });
    }

    // Merge with current defaults so legacy rows gain any newly added fields
    tenant.restrictions = normalizeRestrictions(tenant.restrictions);

    if (tenant.status !== 'active') {
      throw new AppError(403, 'forbidden', 'warn', { message: `Tenant is ${tenant.status}` });
    }

    // Populate cache for subsequent requests
    setTenantCache(tenantId, tenant);

    // Set tenant context — handlers use tenantRead for product entity RLS reads
    ctx.set('db', baseDb);
    ctx.set('tenantId', tenantId);
    ctx.set('tenant', tenant);

    await next();
  },
);
