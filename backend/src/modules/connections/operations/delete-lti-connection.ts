import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { deleteConnection } from '#/modules/connections/connections-queries';
import { getValidChannel } from '#/permissions/get-valid-channel';
import { log } from '#/utils/logger';

/**
 * Removes an LTI connection of the organization's tenant, for a caller who may update the organization.
 * @throws AppError 404 `not_found`, also for an SSO connection.
 */
export async function deleteLtiConnectionOp(ctx: UserContext, id: string) {
  const { tenantId, organizationId } = ctx.var;
  await getValidChannel(ctx, organizationId, 'organization', 'update');

  const deleted = await deleteConnection(ctx, { id, tenantId, kind: 'lti' });
  if (!deleted) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'connection' } });

  log.info('LTI connection deleted', { connectionId: id, tenantId });
}
