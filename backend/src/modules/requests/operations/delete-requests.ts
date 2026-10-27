import type { UserContext } from '#/core/context';
import { deleteRequestsByIds } from '#/modules/requests/requests-queries';

export async function deleteRequestsOp(ctx: UserContext, ids: string[]) {
  await deleteRequestsByIds(ctx, { ids });

  return { data: [], rejectedIds: [] };
}
