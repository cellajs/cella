import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { checkSlugAvailable } from '#/modules/entities/helpers/check-slug';
import { findUserById, type UpdateMeOpts, updateMe } from '#/modules/me/me-queries';
import { getIsoDate } from '#/utils/iso-date';

interface UpdateMeInput {
  slug?: string;
  firstName?: string | null;
  lastName?: string | null;
  thumbnailUrl?: string | null;
  bannerUrl?: string | null;
  language?: string;
  newsletter?: boolean;
  userFlags?: { finishedOnboarding?: boolean };
}

export async function updateMeOp(ctx: AuthContext, input: UpdateMeInput) {
  const user = ctx.var.user;

  if (!user) throw new AppError(404, 'not_found', 'warn', { entityType: 'user', meta: { user: 'self' } });

  const { userFlags, slug, firstName, lastName, ...rest } = input;

  if (slug && slug !== user.slug) {
    const slugAvailable = await checkSlugAvailable(ctx, slug, 'user');
    if (!slugAvailable) throw new AppError(409, 'slug_exists', 'warn', { entityType: 'user', meta: { slug } });
  }

  const updateData = {
    ...rest,
    ...(slug && { slug }),
    ...(firstName !== undefined && { firstName }),
    ...(lastName !== undefined && { lastName }),
    ...(userFlags && { userFlags }),
    ...((firstName || lastName) && { name: [firstName, lastName].filter(Boolean).join(' ') }),
    updatedAt: getIsoDate(),
    updatedBy: user.id,
  };

  await updateMe(ctx, { values: updateData as UpdateMeOpts['values'] });
  invalidateCache.user(user.id);

  const userWithActivity = await findUserById(ctx);
  return userWithActivity;
}
