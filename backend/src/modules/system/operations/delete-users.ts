import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { findUsersByIds } from '#/modules/system/system-queries';
import { deleteAccounts } from '#/modules/user/helpers/delete-accounts';
import { log } from '#/utils/logger';

export async function deleteUsersOp(ctx: UserContext, ids: string[]) {
  const toDeleteIds = Array.isArray(ids) ? ids : [ids];

  const targets = await findUsersByIds(ctx, { ids: toDeleteIds });

  const foundIds = targets.map(({ id }) => id);
  const rejectedIds = toDeleteIds.filter((id) => !foundIds.includes(id));

  if (!foundIds.length) throw new AppError(404, 'not_found', 'warn', { entityType: 'user' });

  await deleteAccounts(ctx, { userIds: foundIds, by: ctx.var.user.id });
  log.info('Users deleted', { count: foundIds.length, ids: foundIds });

  return { data: [] as never[], rejectedIds };
}
