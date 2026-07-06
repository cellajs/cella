import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import { deletePagesByIds } from '#/modules/page/page-queries';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';

export async function deletePagesOp(ctx: AuthContext, ids: string[]) {
  if (!ids.length) throw new AppError(400, 'invalid_request', 'warn', { entityType: 'page' });
  await deletePagesByIds(ctx, { ids, deletedAt: getIsoDate(), deletedBy: ctx.var.user.id });
  log.info('Pages deleted', { ids });
}
