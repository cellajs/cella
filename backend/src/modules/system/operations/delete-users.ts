import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { deleteUsersByIds, findUsersByIds } from '#/modules/system/system-queries';
import { logEvent } from '#/utils/logger';

export async function deleteUsersOp(ctx: AuthContext, ids: string[]) {
  const toDeleteIds = Array.isArray(ids) ? ids : [ids];

  // Fetch users by IDs to verify they exist
  const targets = await findUsersByIds(ctx, { ids: toDeleteIds });

  const foundIds = targets.map(({ id }) => id);
  const rejectedIds = toDeleteIds.filter((id) => !foundIds.includes(id));

  // If no valid users found, return error
  if (!foundIds.length) throw new AppError(404, 'not_found', 'warn', { entityType: 'user' });

  // Delete users — CASCADE SET NULL on createdBy/updatedBy propagates to product entities
  await deleteUsersByIds(ctx, { ids: foundIds });

  for (const id of foundIds) invalidateCache.user(id);
  logEvent(ctx, 'info', 'Users deleted', { count: foundIds.length, ids: foundIds });

  return { data: [] as never[], rejectedIds };
}
