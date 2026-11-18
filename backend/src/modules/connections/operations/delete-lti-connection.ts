import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { revokeConnectionSessions } from '#/modules/auth/core';
import { deleteConnection, findConnectionById } from '#/modules/connections/connections-queries';
import { getValidChannel } from '#/permissions/get-valid-channel';
import { log } from '#/utils/logger';

/**
 * Removes an LTI connection of the organization's tenant, for a caller who may update the organization, and ends every
 * session its launches started in the same transaction.
 * @throws AppError 404 `not_found`, also for an SSO connection.
 */
export async function deleteLtiConnectionOp(ctx: UserContext, id: string) {
  const { tenantId, organizationId } = ctx.var;
  await getValidChannel(ctx, organizationId, 'organization', 'update');

  await ctx.var.db.transaction(async (tx) => {
    const txCtx = { var: { db: tx } };
    const connection = await findConnectionById(txCtx, { id, tenantId });
    if (connection?.kind !== 'lti') throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'connection' } });

    // Before the delete, which clears the sessions' `connectionId`.
    await revokeConnectionSessions(txCtx, { connectionId: id, by: ctx.var.user.id });
    await deleteConnection(txCtx, { id, tenantId, kind: 'lti' });
  });

  log.info('LTI connection deleted', { connectionId: id, tenantId });
}
