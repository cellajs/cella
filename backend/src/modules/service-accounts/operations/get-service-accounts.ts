import type { UserContext } from '#/core/context';
import { requireOrgAdmin } from '#/modules/service-accounts/helpers/managed-service-account';
import { listServiceAccounts } from '#/modules/service-accounts/service-accounts-queries';
import type { ServiceAccountListQuery } from '#/modules/service-accounts/service-accounts-schema';

export async function getServiceAccountsOp(ctx: UserContext, input: ServiceAccountListQuery) {
  await requireOrgAdmin(ctx);
  return listServiceAccounts(ctx, { ...input, tenantId: ctx.var.tenantId });
}
