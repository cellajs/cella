/**
 * Middleware for cross-tenant authenticated routes.
 *
 * This middleware validates authentication for cross-tenant routes.
 * Sets ctx.var.db = baseDb; handlers use tenantRead() for cross-tenant product entity queries.
 * Used for routes like GET /organizations that list entities across tenants.
 *
 * @see info/ARCHITECTURE.md for architecture documentation
 */

import { baseDb } from '#/db/db';
import { xMiddleware } from '#/docs/x-middleware';
import { AppError } from '#/lib/error';

/**
 * Guard middleware for authenticated cross-tenant routes.
 * Sets baseDb context for cross-tenant queries; handlers use tenantRead() for RLS when needed.
 *
 * @param ctx - Request/response context
 * @param next - The next middleware or route handler
 * @returns Continues to next handler with user RLS context set
 */
export const crossTenantGuard = xMiddleware(
  {
    functionName: 'crossTenantGuard',
    type: 'x-guard',
    name: 'crossTenant',
    description: 'Requires authGuard and sets baseDb for cross-tenant access',
  },
  async (ctx, next) => {
    const user = ctx.var.user;
    const memberships = ctx.var.memberships;

    // Require authenticated user (this middleware requires authGuard to run first)
    if (!user || memberships === undefined) {
      throw new AppError(401, 'unauthorized', 'warn', {
        message: 'crossTenantGuard requires authGuard middleware',
      });
    }

    // Set baseDb — handlers use tenantRead for product entity RLS reads
    ctx.set('db', baseDb);
    await next();
  },
);
