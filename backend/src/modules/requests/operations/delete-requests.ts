import type { AuthContext } from '#/core/context';
import { deleteRequestsByIds } from '#/modules/requests/requests-queries';

export async function deleteRequestsOp(ctx: AuthContext, ids: string[]) {
  const toDeleteIds = Array.isArray(ids) ? ids : [ids];

  await deleteRequestsByIds(ctx, { ids: toDeleteIds });

  return { data: [], rejectedIds: [] };
}
