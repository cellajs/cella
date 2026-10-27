import type { UserFlags } from 'shared';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { updateStamps } from '#/db/utils/stamps';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { releaseReplacedImages } from '#/modules/attachment/operations/release-replaced-images';
import { checkSlugAvailable } from '#/modules/entities/operations/check-slug';
import { nameAfterUpdate } from '#/modules/user/helpers/name-after-update';
import type { UserModel } from '#/modules/user/user-db';
import { findUserById, updateUser } from '#/modules/user/user-queries';

interface UpdateMeInput {
  slug?: string;
  firstName?: string | null;
  lastName?: string | null;
  description?: string | null;
  thumbnailUrl?: string | null;
  bannerUrl?: string | null;
  language?: UserModel['language'];
  newsletter?: boolean;
  userFlags?: Partial<Record<keyof UserFlags, boolean>>;
}

export async function updateMeOp(ctx: UserContext, input: UpdateMeInput) {
  const user = ctx.var.user;

  const { slug, firstName, lastName } = input;

  if (slug && slug !== user.slug) {
    const slugAvailable = await checkSlugAvailable(ctx, slug, 'user');
    if (!slugAvailable) throw new AppError(409, 'slug_exists', 'warn', { entityType: 'user', meta: { slug } });
  }

  const values = { ...input, name: nameAfterUpdate(user, { firstName, lastName, slug }), ...updateStamps(user.id) };
  await updateUser(ctx, { id: user.id, values });
  invalidateCache.user(user.id);
  await releaseReplacedImages({ holder: { userId: user.id }, before: user, after: input });

  return findUserById(ctx, { id: user.id });
}
