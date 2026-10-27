import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { findServiceAccountInTenant } from '#/modules/service-accounts/service-accounts-queries';
import { getValidChannel } from '#/permissions';

/**
 * The service account a management route names, with its activity time. Who may manage a machine actor is one rule:
 * the caller may update the organization, checked before the account is read.
 * @throws AppError 404 `not_found` (`meta.resource: 'serviceAccount'`) for an account of another tenant or none.
 */
export async function getManagedServiceAccount(ctx: UserContext, serviceAccountId: string) {
  await getValidChannel(ctx, ctx.var.organizationId, 'organization', 'update');
  const account = await findServiceAccountInTenant(ctx, { id: serviceAccountId, tenantId: ctx.var.tenantId });
  if (!account) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'serviceAccount' } });
  return account;
}
