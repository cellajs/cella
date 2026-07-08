import { AppError } from '#/core/error';
import { xMiddleware } from '#/core/x-middleware';
import { baseDb } from '#/db/db';

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

    // Handlers use tenantRead for product entity RLS reads.
    ctx.set('db', baseDb);
    await next();
  },
);
