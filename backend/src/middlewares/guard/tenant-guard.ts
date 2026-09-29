import type { Context } from 'hono';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { xMiddleware } from '#/core/x-middleware';
import { baseDb } from '#/db/db';
import { countOrganizationsByTenant } from '#/modules/organization/organization-queries';
import { loadTenant } from '#/modules/tenants/helpers/load-tenant';
import type { TenantModel } from '#/modules/tenants/tenants-db';

type Actor = NonNullable<Env['Variables']['actor']>;

/**
 * A foothold in the tenant: a service account holds at least one binding (its bindings live in its own tenant); a user
 * has a membership there or is system admin. The tenant's creator holds one only while the tenant has no organization
 * (bootstrap): creating it makes them its admin, and leaving it ends their part in the tenant.
 */
const holdsFoothold = async (ctx: Context<Env>, actor: Actor, tenant: TenantModel): Promise<boolean> => {
  if (actor.kind === 'service') return actor.bindings.length > 0;
  if (ctx.var.isSystemAdmin || actor.bindings.some((m) => m.tenantId === tenant.id)) return true;
  if (tenant.createdBy !== actor.id) return false;
  return (await countOrganizationsByTenant({ var: { db: baseDb } }, { tenantId: tenant.id })) === 0;
};

/**
 * Resolves the URL's tenant and checks the actor may act in it (see {@link holdsFoothold}). A missing tenant, one the
 * actor holds no foothold in and an inactive one without a foothold get one identical 403, so the six-character tenant
 * ids cannot be enumerated; the tenant's status shows only past that check. Sets baseDb + tenant context; orgGuard
 * resolves organizations.
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

    const tenant = await loadTenant(tenantId);
    if (!tenant || !(await holdsFoothold(ctx, actor, tenant))) {
      throw new AppError(403, 'forbidden', 'warn', { meta: { resource: 'tenant' } });
    }
    if (tenant.status !== 'active') {
      throw new AppError(403, 'forbidden', 'warn', { meta: { resource: 'tenant', tenantStatus: tenant.status } });
    }

    // TODO(sso): Enforce non-empty tenant auth strategies for user actors, exempting system administrators.
    // Reject mismatches with `sso_required` and a tenant-entry redirect hint.

    // Handlers use tenantRead for product entity RLS reads.
    ctx.set('db', baseDb);
    ctx.set('tenantId', tenantId);
    ctx.set('tenant', tenant);
    await next();
  },
);
