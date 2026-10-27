import type { UserContext } from '#/core/context';
import { withActorRefs } from '#/modules/actors/actor-refs';
import { findServiceAccountsPaginated } from '#/modules/service-accounts/service-accounts-queries';
import type { ServiceAccountListQuery } from '#/modules/service-accounts/service-accounts-schema';
import { getValidChannel } from '#/permissions';

/** A page of the organization's service accounts, for a caller who may update the organization. */
export async function getServiceAccountsOp(ctx: UserContext, input: ServiceAccountListQuery) {
  await getValidChannel(ctx, ctx.var.organizationId, 'organization', 'update');
  const { items, total } = await findServiceAccountsPaginated(ctx, { ...input, tenantId: ctx.var.tenantId });
  return { items: await withActorRefs(ctx, items), total };
}
