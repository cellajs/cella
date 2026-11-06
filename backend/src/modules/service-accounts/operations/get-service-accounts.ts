import type { UserContext } from '#/core/context';
import { withActorRefs } from '#/modules/actors/actor-refs';
import { organizationRole } from '#/modules/service-accounts/helpers/organization-role';
import { findServiceAccountsPaginated } from '#/modules/service-accounts/service-accounts-queries';
import type { ServiceAccountListQuery } from '#/modules/service-accounts/service-accounts-schema';
import { getValidChannel } from '#/permissions/get-valid-channel';
import type { PageWindow } from '#/utils/list-page';

/** A page of the organization's service accounts, for a caller who may update the organization. */
export async function getServiceAccountsOp(ctx: UserContext, { q }: ServiceAccountListQuery, { offset, limit }: PageWindow) {
  await getValidChannel(ctx, ctx.var.organizationId, 'organization', 'update');
  const { items, total } = await findServiceAccountsPaginated(ctx, { q, offset, limit, tenantId: ctx.var.tenantId });
  return { items: (await withActorRefs(ctx, items)).map((item) => ({ ...item, role: organizationRole(item) })), total };
}
