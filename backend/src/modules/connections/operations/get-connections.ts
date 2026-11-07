import type { UserContext } from '#/core/context';
import { withActorRefs } from '#/modules/actors/actor-refs';
import { findConnectionsByTenant } from '#/modules/connections/connections-queries';

/** The request tenant's connections, their writers resolved to actor refs. */
export const getConnectionsOp = async (ctx: UserContext) => withActorRefs(ctx, await findConnectionsByTenant(ctx, { tenantId: ctx.var.tenantId }));
