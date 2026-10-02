import type { Context } from 'hono';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { xMiddleware } from '#/core/x-middleware';
import { baseDb } from '#/db/db';
import { findConnectionBindingUser } from '#/modules/connections/connections-queries';
import { countOrganizationsByTenant } from '#/modules/organization/organization-queries';
import { loadTenant } from '#/modules/tenants/operations/load-tenant';
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
    description: 'Requires being in the tenant: a member, a system admin, or its creator while it has no organization',
  },
  async (ctx, next) => {
    const rawTenantId = ctx.req.param('tenantId');
    if (!rawTenantId) {
      throw new AppError(400, 'invalid_request', 'error', { meta: { reason: 'Missing tenantId parameter' } });
    }
    const tenantId = rawTenantId.toLowerCase();

    const actor = ctx.var.actor;
    if (!actor) throw new AppError(401, 'unauthorized', 'warn', { message: 'tenantGuard requires userGuard or serviceGuard' });

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

    // The tenant's sign-in policy (D17): a person who holds an identity through this tenant's connection must have
    // signed in with an allowed method, whether by session or by a token their session authorized. Externals without
    // such an identity are untouched, system admins exempt, and a session's method is in the cached facts, so only
    // the mismatch pays for the lookup.
    if (actor.kind === 'user' && !ctx.var.isSystemAdmin && tenant.authStrategies.length > 0) {
      const strategy = actor.authStrategy ?? null;
      if (!strategy || !tenant.authStrategies.includes(strategy)) {
        const connection = await findConnectionBindingUser({ var: { db: baseDb } }, { userId: actor.id, tenantId: tenant.id });
        if (connection) {
          throw new AppError(403, 'sso_required', 'warn', {
            meta: { resource: 'tenant', connectionId: connection.id, entryPath: `/auth/sso/${connection.id}` },
          });
        }
      }
    }

    // Handlers use tenantRead for product entity RLS reads.
    ctx.set('db', baseDb);
    ctx.set('tenantId', tenantId);
    ctx.set('tenant', tenant);
    await next();
  },
);
