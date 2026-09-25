import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { endSessions } from '#/modules/auth/general/helpers/end-sessions';
import { deleteUsersByIds, findUsersByIds } from '#/modules/system/system-queries';
import { log } from '#/utils/logger';

export async function deleteUsersOp(ctx: UserContext, ids: string[]) {
  const toDeleteIds = Array.isArray(ids) ? ids : [ids];

  const targets = await findUsersByIds(ctx, { ids: toDeleteIds });

  const foundIds = targets.map(({ id }) => id);
  const rejectedIds = toDeleteIds.filter((id) => !foundIds.includes(id));

  if (!foundIds.length) throw new AppError(404, 'not_found', 'warn', { entityType: 'user' });

  // CASCADE SET NULL on createdBy/updatedBy propagates to product entities.
  await deleteUsersByIds(ctx, { ids: foundIds });

  for (const id of foundIds) {
    await endSessions(ctx, { userId: id, all: true, reason: 'user_deleted', by: ctx.var.user.id });
  }
  log.info('Users deleted', { count: foundIds.length, ids: foundIds });

  return { data: [] as never[], rejectedIds };
}
