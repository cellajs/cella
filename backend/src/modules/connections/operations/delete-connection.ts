import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { revokeConnectionSessions } from '#/modules/auth/core';
import type { ConnectionKind } from '#/modules/connections/connections-db';
import { deleteConnection, lockConnectionForDelete } from '#/modules/connections/connections-queries';
import { disableConnectionServiceAccount } from '#/modules/service-accounts/service-accounts-queries';
import { log } from '#/utils/logger';

/**
 * Removes a tenant's connection and ends every session that came through it, in one transaction. Identities that came
 * through it keep their rows with the reference cleared; the members stay members. The service account an LTI
 * connection writes as stays too, disabled.
 * @throws AppError 404 `not_found`, also for a connection of another kind than `kind`.
 */
export async function deleteConnectionOp(ctx: UserContext, { id, kind }: { id: string; kind?: ConnectionKind }) {
  const { tenantId } = ctx.var;
  await ctx.var.db.transaction(async (tx) => {
    const txCtx = { var: { db: tx } };
    // Locked before anything is revoked: a session or an import's write made before is committed by then, and any after waits.
    const connection = await lockConnectionForDelete(txCtx, { id, tenantId });
    if (!connection || (kind && connection.kind !== kind)) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'connection' } });

    // Before the delete, which clears the sessions' `connectionId`.
    await revokeConnectionSessions(txCtx, { connectionId: id, by: ctx.var.user.id });
    await disableConnectionServiceAccount(txCtx, { connectionId: id, by: ctx.var.user.id });
    await deleteConnection(txCtx, { id, tenantId });
  });

  log.info('Connection deleted', { connectionId: id, tenantId });
}
