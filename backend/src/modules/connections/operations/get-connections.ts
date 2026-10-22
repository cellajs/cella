import type { UserContext } from '#/core/context';
import { withActorRefs } from '#/modules/actors/actor-refs';
import { findConnectionsByTenant } from '#/modules/connections/connections-queries';

/** The tenant's connections, oldest first. */
export const getConnectionsOp = async (ctx: UserContext) => withActorRefs(ctx, await findConnectionsByTenant(ctx, { tenantId: ctx.var.tenantId }));
