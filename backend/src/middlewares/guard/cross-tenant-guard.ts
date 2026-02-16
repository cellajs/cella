/**
 * Middleware for cross-tenant authenticated routes.
 *
 * This middleware wraps the request in a user RLS context (no tenant context),
 * allowing queries that span multiple tenants based on user memberships.
 * Used for routes like GET /organizations that list entities across tenants.
 *
 * @see info/RLS.md for architecture documentation
 */

import { setUserRlsContext } from '#/db/tenant-context';
import { xMiddleware } from '#/docs/x-middleware';
import { AppError } from '#/lib/error';

/**
 * Guard middleware for authenticated cross-tenant routes.
 * Wraps handler in user RLS context for cross-tenant membership-based access.
 *
 * @param ctx - Request/response context
 * @param next - The next middleware or route handler
 * @returns Continues to next handler with user RLS context set
 */
export const crossTenantGuard = xMiddleware(
  'crossTenantGuard',
  'x-guard',
  async (ctx, next) => {
    const user = ctx.var.user;
    const memberships = ctx.var.memberships;

    // Require authenticated user (this middleware requires authGuard to run first)
    if (!user || memberships === undefined) {
      throw new AppError(401, 'unauthorized', 'warn', {
        message: 'crossTenantGuard requires authGuard middleware',
      });
    }

    // Wrap remaining middleware chain in user RLS context
    return setUserRlsContext({ userId: user.id }, async (tx) => {
      ctx.set('db', tx);
      await next();
    });
  },
  'Wraps handler in user RLS context for cross-tenant access',
);
