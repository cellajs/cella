import type { UserContext } from '#/core/context';
import { withActorRefs } from '#/modules/actors/actor-refs';
import { listServiceAccounts } from '#/modules/service-accounts/service-accounts-queries';
import type { ServiceAccountListQuery } from '#/modules/service-accounts/service-accounts-schema';
import { getValidChannel } from '#/permissions';

export async function getServiceAccountsOp(ctx: UserContext, input: ServiceAccountListQuery) {
  await getValidChannel(ctx, ctx.var.organizationId, 'organization', 'update');
  const { items, total } = await listServiceAccounts(ctx, { ...input, tenantId: ctx.var.tenantId });
  return { items: await withActorRefs(ctx, items), total };
}
