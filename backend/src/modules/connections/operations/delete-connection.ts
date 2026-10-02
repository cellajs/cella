import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { deleteConnection } from '#/modules/connections/connections-queries';
import { log } from '#/utils/logger';

/**
 * Removes a tenant's connection. Identities and sessions that came through it keep their rows with the reference
 * cleared; the members stay members.
 * @throws AppError 404 `not_found`.
 */
export async function deleteConnectionOp(ctx: UserContext, id: string) {
  const deleted = await deleteConnection(ctx, { id, tenantId: ctx.var.tenantId });
  if (!deleted) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'connection' } });

  log.info('Connection deleted', { connectionId: id, tenantId: ctx.var.tenantId });

  return deleted;
}
