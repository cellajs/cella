import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { revokeConnectionSessions } from '#/modules/auth/core';
import type { ConnectionKind } from '#/modules/connections/connections-db';
import { deleteConnection, findConnectionById, lockConnection } from '#/modules/connections/connections-queries';
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
    const connection = await findConnectionById(txCtx, { id, tenantId });
    if (!connection || (kind && connection.kind !== kind)) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'connection' } });
    // An import that is making the connection's service account holds this lock: the disable below then finds the account.
    await lockConnection(txCtx, { id });

    // Before the delete, which clears the sessions' `connectionId`.
    await revokeConnectionSessions(txCtx, { connectionId: id, by: ctx.var.user.id });
    await disableConnectionServiceAccount(txCtx, { connectionId: id, by: ctx.var.user.id });
    await deleteConnection(txCtx, { id, tenantId });
  });

  log.info('Connection deleted', { connectionId: id, tenantId });
}
