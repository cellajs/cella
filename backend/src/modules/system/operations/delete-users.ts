import type { UserContext } from '#/core/context';
import { deleteAccounts } from '#/modules/user/operations/delete-accounts';
import { findExistingUserIds } from '#/modules/user/user-queries';
import { log } from '#/utils/logger';

/** Deletes the accounts these ids name; an id that names no user comes back in `rejectedIds`, every id when none does. */
export async function deleteUsersOp(ctx: UserContext, ids: string[]) {
  const targets = await findExistingUserIds(ctx, { ids });

  const foundIds = targets.map(({ id }) => id);
  const rejectedIds = ids.filter((id) => !foundIds.includes(id));
  if (!foundIds.length) return { results: [], rejectedIds };

  await deleteAccounts(ctx, { userIds: foundIds, by: ctx.var.user.id });
  log.info('Users deleted', { count: foundIds.length, ids: foundIds });

  return { results: [], rejectedIds };
}
