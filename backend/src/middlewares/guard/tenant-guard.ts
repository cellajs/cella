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
 * @see info/RLS.md for architecture documentation
 */

import * as Sentry from '@sentry/node';
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
  'tenantGuard',
  'x-guard',
  async (ctx, next) => {
    const rawTenantId = ctx.req.param('tenantId');

    if (!rawTenantId) {
      throw new AppError(400, 'invalid_request', 'error', { meta: { reason: 'Missing tenantId parameter' } });
    }

    const tenantId = rawTenantId.toLowerCase();

    const user = ctx.var.user;
    const memberships = ctx.var.memberships;
    const userSystemRole = ctx.var.userSystemRole;

    // Require authenticated user (this middleware is for authenticated routes)
    if (!user || memberships === undefined) {
      throw new AppError(401, 'unauthorized', 'warn', {
        message: 'tenantGuard requires authGuard middleware',
      });
    }

    // Verify user has access to this tenant (via membership) or is system admin
    const hasTenantMembership = memberships.some((m) => m.tenantId === tenantId);
    if (userSystemRole !== 'admin' && !hasTenantMembership) {
      throw new AppError(403, 'forbidden', 'warn', { meta: { resource: 'tenant' } });
    }

    // Set Sentry context
    Sentry.setTag('tenant_id', tenantId);

    // Wrap remaining middleware chain in tenant context with RLS active
    return setTenantRlsContext(
      {
        tenantId,
        userId: user.id,
      },
      async (tx) => {
        ctx.set('db', tx);
        ctx.set('tenantId', tenantId);

        await next();
      },
    );
  },
  'Validates tenant access and wraps handler in RLS-enabled transaction',
);
