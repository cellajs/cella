import type { UserContext } from '#/core/context';
import { findConnectionsByTenant } from '#/modules/connections/connections-queries';

/** The tenant's connections, oldest first. */
export const getConnectionsOp = async (ctx: UserContext) => findConnectionsByTenant(ctx, { tenantId: ctx.var.tenantId });
