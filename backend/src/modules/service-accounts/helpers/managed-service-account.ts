import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { findServiceAccountInTenant } from '#/modules/service-accounts/service-accounts-queries';
import { getValidChannel } from '#/permissions';

/** Every service-account route is an organization admin's act (D9): the caller must be allowed to update the org. */
export async function requireOrgAdmin(ctx: UserContext) {
  return getValidChannel(ctx, ctx.var.organizationId, 'organization', 'update');
}

/** The admin check plus the account the route addresses; 404 when it is not in the caller's tenant. */
export async function loadManagedServiceAccount(ctx: UserContext, id: string) {
  await requireOrgAdmin(ctx);
  const account = await findServiceAccountInTenant(ctx, { id, tenantId: ctx.var.tenantId });
  if (!account) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'serviceAccount' } });
  return account;
}
