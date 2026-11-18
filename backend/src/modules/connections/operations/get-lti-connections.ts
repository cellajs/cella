import type { UserContext } from '#/core/context';
import { withActorRefs } from '#/modules/actors/actor-refs';
import { findConnectionsByTenant } from '#/modules/connections/connections-queries';
import { getValidChannel } from '#/permissions/get-valid-channel';

/** The LTI connections of the organization's tenant, for a caller who may update the organization. */
export async function getLtiConnectionsOp(ctx: UserContext) {
  await getValidChannel(ctx, ctx.var.organizationId, 'organization', 'update');
  return withActorRefs(ctx, await findConnectionsByTenant(ctx, { tenantId: ctx.var.tenantId, kind: 'lti' }));
}
