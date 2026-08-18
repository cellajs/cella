import { AppError } from '#/core/error';
import { xMiddleware } from '#/core/x-middleware';
import { baseDb } from '#/db/db';

/** Sets baseDb for authenticated cross-tenant routes; handlers call tenantRead() when they need RLS. */
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

    if (!user || memberships === undefined) {
      throw new AppError(401, 'unauthorized', 'warn', {
        message: 'crossTenantGuard requires authGuard middleware',
      });
    }

    ctx.set('db', baseDb);
    await next();
  },
);
