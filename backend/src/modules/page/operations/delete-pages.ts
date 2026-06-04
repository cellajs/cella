import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import { deletePagesByIds } from '#/modules/page/page-queries';
import { logEvent } from '#/utils/logger';

export async function deletePagesOp(ctx: AuthContext, ids: string[]) {
  if (!ids.length) throw new AppError(400, 'invalid_request', 'warn', { entityType: 'page' });
  await deletePagesByIds(ctx, { ids });
  logEvent(ctx, 'info', 'Pages deleted', { ids });
}
