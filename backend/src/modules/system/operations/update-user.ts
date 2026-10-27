import type { z } from '@hono/zod-openapi';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { updateStamps } from '#/db/utils/stamps';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { releaseReplacedImages } from '#/modules/attachment/operations/release-replaced-images';
import { checkSlugAvailable } from '#/modules/entities/operations/check-slug';
import { updateUser } from '#/modules/system/system-queries';
import type { systemUserUpdateBodySchema } from '#/modules/system/system-schema';
import { findUserById } from '#/modules/user/user-queries';
import { log } from '#/utils/logger';

type UpdateUserInput = z.infer<typeof systemUserUpdateBodySchema>;

/**
 * A system admin's update of any user; returns the user with their activity times.
 * @throws AppError 404 `not_found` for an unknown id, 409 `slug_exists` for a slug another user holds.
 */
export async function updateUserOp(ctx: UserContext, id: string, input: UpdateUserInput) {
  const user = ctx.var.user;

  const targetUser = await findUserById(ctx, { id });
  if (!targetUser) throw new AppError(404, 'not_found', 'warn', { entityType: 'user', meta: { user: id } });

  const { bannerUrl, description, firstName, lastName, language, newsletter, thumbnailUrl, slug } = input;

  if (slug && slug !== targetUser.slug) {
    const slugAvailable = await checkSlugAvailable(ctx, slug, 'user');
    if (!slugAvailable) throw new AppError(409, 'slug_exists', 'warn', { entityType: 'user', meta: { slug } });
  }

  // The name follows a changed first or last name, merged over the stored one; a body without either keeps it.
  const namesChanged = firstName !== undefined || lastName !== undefined;
  const fullName = [firstName === undefined ? targetUser.firstName : firstName, lastName === undefined ? targetUser.lastName : lastName]
    .filter(Boolean)
    .join(' ');

  const values = {
    bannerUrl,
    description,
    firstName,
    lastName,
    language,
    newsletter,
    thumbnailUrl,
    slug,
    ...(namesChanged && { name: fullName || slug }),
    ...updateStamps(user.id),
  };
  const updatedUser = await updateUser(ctx, { id: targetUser.id, values });
  invalidateCache.user(updatedUser.id);
  await releaseReplacedImages({ owner: { userId: targetUser.id }, before: targetUser, after: { thumbnailUrl, bannerUrl } });
  log.info('User updated', { userId: updatedUser.id });

  // Re-select to include the activity times of the user's actors row
  const userWithActivity = await findUserById(ctx, { id: updatedUser.id });

  return userWithActivity;
}
