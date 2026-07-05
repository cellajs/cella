import type { z } from '@hono/zod-openapi';
import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { checkSlugAvailable } from '#/modules/entities/helpers/check-slug';
import { findUserById, updateUser } from '#/modules/system/system-queries';
import type { userUpdateBodySchema } from '#/modules/user/user-schema';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';

type UpdateUserInput = z.infer<typeof userUpdateBodySchema>;

export async function updateUserOp(ctx: AuthContext, id: string, input: UpdateUserInput) {
  const user = ctx.var.user;

  const targetUser = await findUserById(ctx, { id });
  if (!targetUser) throw new AppError(404, 'not_found', 'warn', { entityType: 'user', meta: { user: id } });

  const { bannerUrl, firstName, lastName, language, newsletter, thumbnailUrl, slug } = input;

  // Check if slug is available
  if (slug && slug !== targetUser.slug) {
    const slugAvailable = await checkSlugAvailable(ctx, slug, 'user');
    if (!slugAvailable) throw new AppError(409, 'slug_exists', 'warn', { entityType: 'user', meta: { slug } });
  }

  const values = {
    bannerUrl,
    firstName,
    lastName,
    language,
    newsletter,
    thumbnailUrl,
    slug,
    name: [firstName, lastName].filter(Boolean).join(' ') || slug,
    updatedAt: getIsoDate(),
    updatedBy: user.id,
  };
  const updatedUser = await updateUser(ctx, { id: targetUser.id, values });

  invalidateCache.user(updatedUser.id);
  log.info('User updated', { userId: updatedUser.id });

  // Re-select with userSelect to include timestamps (subqueries from user_counters table)
  const userWithActivity = await findUserById(ctx, { id: updatedUser.id });

  return userWithActivity;
}
