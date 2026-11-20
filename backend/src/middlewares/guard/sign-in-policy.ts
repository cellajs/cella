import type { Actor, DbContext } from '#/core/context';
import { isFederationKey } from '#/modules/auth/core';
import { findUserSsoConnection } from '#/modules/connections/connections-queries';
import { loadTenant } from '#/modules/tenants/load-tenant';
import type { TenantModel } from '#/modules/tenants/tenants-db';

type UserActor = Extract<Actor, { kind: 'user' }>;

/**
 * The tenant's connection whose sign-in policy the person fails, or undefined when it lets them act there. A person who
 * holds an identity through the tenant's connection must have signed in with an allowed method, whether by session or
 * by a token their session authorized, and with a federation only through that connection. Externals without such an
 * identity are untouched. Only a mismatch or a federation sign-in pays for the lookup: a session's method and
 * connection are in the cached facts.
 */
export const refusingConnection = async (ctx: DbContext, actor: UserActor, tenant: TenantModel): Promise<{ id: string } | undefined> => {
  if (tenant.authStrategies.length === 0) return undefined;
  const strategy = actor.authStrategy ?? null;
  const allowed = !!strategy && tenant.authStrategies.includes(strategy);
  if (allowed && !isFederationKey(strategy)) return undefined;
  const connection = await findUserSsoConnection(ctx, { userId: actor.id, tenantId: tenant.id });
  return connection && (!allowed || actor.connectionId !== connection.id) ? connection : undefined;
};

/**
 * The ids of the tenants among `memberships` whose sign-in policy refuses the person ({@link refusingConnection}). Their
 * memberships lend the session nothing on a user-level route: a tenant route refuses with `sso_required` in `tenantGuard`.
 */
export const tenantsRefusingActor = async (ctx: DbContext, actor: UserActor, memberships: { tenantId: string }[]): Promise<Set<string>> => {
  const tenantIds = [...new Set(memberships.map(({ tenantId }) => tenantId))];
  const refused = await Promise.all(
    tenantIds.map(async (tenantId) => {
      const tenant = await loadTenant(tenantId);
      return tenant && (await refusingConnection(ctx, actor, tenant)) ? [tenantId] : [];
    }),
  );
  return new Set(refused.flat());
};
