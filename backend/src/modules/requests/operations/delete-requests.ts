import type { UserContext } from '#/core/context';
import { deleteRequestsByIds } from '#/modules/requests/requests-queries';

/** Deletes requests by id; an id without a request comes back in `rejectedIds`. */
export async function deleteRequestsOp(ctx: UserContext, ids: string[]) {
  const deleted = new Set((await deleteRequestsByIds(ctx, { ids })).map(({ id }) => id));

  return { results: [], rejectedIds: ids.filter((id) => !deleted.has(id)) };
}
