import type { UserContext } from '#/core/context';
import { deleteRequestsByIds } from '#/modules/requests/requests-queries';

/** Deletes requests by id; an id without a request is not reported. */
export async function deleteRequestsOp(ctx: UserContext, ids: string[]) {
  await deleteRequestsByIds(ctx, { ids });

  return { data: [], rejectedIds: [] };
}
