import type { Context } from 'hono';
import type { Actor, Env } from '#/core/context';
import { AppError } from '#/core/error';
import { xMiddleware } from '#/core/x-middleware';
import { routeTarget } from '#/middlewares/guard/route-target';
import { refusingConnection } from '#/middlewares/guard/sign-in-policy';
import { countOrganizationsByTenant } from '#/modules/organization/organization-queries';
import { loadTenant } from '#/modules/tenants/load-tenant';
import type { TenantModel } from '#/modules/tenants/tenants-db';
import { getIsoDate } from '#/utils/iso-date';

/**
 * A foothold in the tenant: a service account holds at least one binding (its bindings live in its own tenant); a user
 * has a membership there or is system admin. Its membership rows decide: a session's bindings leave out a tenant whose
 * sign-in policy refuses it, which the policy check below answers. The tenant's creator holds one only while the tenant
 * has no organization (bootstrap): creating it makes them its admin, and leaving it ends their part in the tenant.
 */
const holdsFoothold = async (ctx: Context<Env>, actor: Actor, tenant: TenantModel): Promise<boolean> => {
  if (actor.kind === 'service') return actor.bindings.length > 0;
  const rows = ctx.var.memberships ?? actor.bindings;
  if (ctx.var.isSystemAdmin || rows.some((row) => row.tenantId === tenant.id)) return true;
  if (tenant.createdBy !== actor.id) return false;
  return (await countOrganizationsByTenant(ctx, { tenantId: tenant.id })) === 0;
};

/**
 * Resolves the URL's tenant and checks the actor may act in it (see {@link holdsFoothold}). A missing tenant, one the
 * actor holds no foothold in and an inactive one without a foothold get one identical 403, which says only "not yours":
 * a tenant id is no secret. The tenant's status shows only past that check. Sets the tenant context; orgGuard
 * resolves organizations.
 */
export const tenantGuard = xMiddleware(
  {
    functionName: 'tenantGuard',
    type: 'x-guard',
    errors: [403],
    requires: ['actor'],
    provides: ['tenant'],
    name: 'Tenant',
    description: "Requires membership in this tenant. System admins also pass, and so does the tenant's creator until it has an organization.",
  },
  async (ctx, next) => {
    const { tenantId } = routeTarget(ctx);

    const actor = ctx.var.actor;

    // A service actor's tenant comes from its key, never from the URL: the two must agree, checked before any lookup
    // so a key learns nothing about other tenants.
    const serviceOfOtherTenant = actor.kind === 'service' && actor.tenantId !== tenantId;
    if (serviceOfOtherTenant) throw new AppError(403, 'forbidden', 'warn', { meta: { resource: 'tenant' } });

    const tenant = await loadTenant(tenantId);
    if (!tenant || !(await holdsFoothold(ctx, actor, tenant))) {
      throw new AppError(403, 'forbidden', 'warn', { meta: { resource: 'tenant' } });
    }
    if (tenant.status !== 'active') {
      throw new AppError(403, 'forbidden', 'warn', { meta: { resource: 'tenant', tenantStatus: tenant.status } });
    }
    // A tenant past its expiry is over before the sweep removes it: a demo ends when its time does.
    if (tenant.expiresAt && tenant.expiresAt < getIsoDate()) {
      throw new AppError(403, 'forbidden', 'warn', { meta: { resource: 'tenant', tenantStatus: 'expired' } });
    }

    // The tenant's sign-in policy (`refusingConnection`); system admins are exempt.
    if (actor.kind === 'user' && !ctx.var.isSystemAdmin) {
      const connection = await refusingConnection(ctx, actor, tenant);
      if (connection) {
        throw new AppError(403, 'sso_required', 'warn', {
          meta: { resource: 'tenant', connectionId: connection.id, entryPath: `/auth/sso/${connection.id}` },
        });
      }
    }

    ctx.set('tenantId', tenantId);
    ctx.set('tenant', tenant);
    await next();
  },
);
