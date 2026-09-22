import { AppError } from '#/core/error';
import { xMiddleware } from '#/core/x-middleware';
import { baseDb } from '#/db/db';
import { loadActiveTenant } from './tenant-cache';

/**
 * Resolves the URL's tenant and checks the actor may act in it: a service account only in the tenant its key belongs
 * to; a user with a membership there, as its creator during bootstrap, or as system admin. Sets baseDb + tenant
 * context; orgGuard resolves organizations.
 */
export const tenantGuard = xMiddleware(
  {
    functionName: 'tenantGuard',
    type: 'x-guard',
    name: 'tenant',
    description: 'Requires userGuard or serviceGuard, validates tenant access, and sets baseDb + tenantId context',
  },
  async (ctx, next) => {
    const rawTenantId = ctx.req.param('tenantId');
    if (!rawTenantId) {
      throw new AppError(400, 'invalid_request', 'error', { meta: { reason: 'Missing tenantId parameter' } });
    }
    const tenantId = rawTenantId.toLowerCase();

    const actor = ctx.var.actor;
    if (!actor)
      throw new AppError(401, 'unauthorized', 'warn', { message: 'tenantGuard requires userGuard or serviceGuard' });

    // A service actor's tenant comes from its key, never from the URL: the two must agree, checked before any lookup
    // so a key learns nothing about other tenants.
    if (actor.kind === 'service' && actor.tenantId !== tenantId) {
      throw new AppError(403, 'forbidden', 'warn', { meta: { resource: 'tenant' } });
    }

    const tenant = await loadActiveTenant(tenantId);

    // A foothold: a service account holds at least one grant (its grants live in its own tenant); a user has a
    // membership in the tenant, is system admin, or created it (bootstrap, before any organization or membership exists).
    const allowed =
      actor.kind === 'service'
        ? actor.grants.length > 0
        : ctx.var.isSystemAdmin || actor.grants.some((m) => m.tenantId === tenantId) || tenant.createdBy === actor.id;
    if (!allowed) throw new AppError(403, 'forbidden', 'warn', { meta: { resource: 'tenant' } });

    // TODO(sso): Enforce non-empty tenant auth strategies for user actors, exempting system administrators.
    // Reject mismatches with `sso_required` and a tenant-entry redirect hint.

    // Handlers use tenantRead for product entity RLS reads.
    ctx.set('db', baseDb);
    ctx.set('tenantId', tenantId);
    ctx.set('tenant', tenant);
    await next();
  },
);
