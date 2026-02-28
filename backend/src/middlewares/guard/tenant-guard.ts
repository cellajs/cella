/**
 * Middleware to ensure tenant-scoped access for authenticated routes.
 *
 * This middleware:
 * 1. Extracts tenantId and orgId from URL path
 * 2. Normalizes tenant ID to lowercase
 * 3. Verifies user has membership in this tenant (or is system admin)
 * 4. Wraps the request in a transaction with RLS session variables set
 * 5. Resolves organization and verifies membership
 *
 * @see info/ARCHITECTURE.md for architecture documentation
 */

import * as Sentry from '@sentry/node';
import { eq } from 'drizzle-orm';
import { baseDb } from '#/db/db';
import { tenantsTable } from '#/db/schema/tenants';
import { setTenantRlsContext } from '#/db/tenant-context';
import { xMiddleware } from '#/docs/x-middleware';
import { AppError } from '#/lib/error';

/**
 * Guard middleware for authenticated tenant-scoped routes.
 * Validates tenant access and wraps handler in RLS-enabled transaction.
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
    description: 'Requires authGuard, validates tenant access, and sets tenant-scoped RLS db context',
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

    // Set Sentry context
    Sentry.setTag('tenant_id', tenantId);

    // Load tenant row (uses baseDb, not RLS-scoped tx, since we're establishing context)
    const [tenant] = await baseDb.select().from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1);

    if (!tenant) {
      throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'tenant' } });
    }

    if (tenant.status !== 'active') {
      throw new AppError(403, 'forbidden', 'warn', { message: `Tenant is ${tenant.status}` });
    }

    // Wrap remaining middleware chain in tenant context with RLS active
    return setTenantRlsContext(
      {
        tenantId,
        userId: user.id,
      },
      async (tx) => {
        ctx.set('db', tx);
        ctx.set('tenantId', tenantId);
        ctx.set('tenant', tenant);

        await next();
      },
    );
  },
);
