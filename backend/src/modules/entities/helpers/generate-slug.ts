import type { ContextEntityType } from 'shared';
import { nanoid } from 'shared/nanoid';
import type { DbContext } from '#/core/context';
import { checkSlugAvailable } from '#/modules/entities/helpers/check-slug';

type EntityTypeWithSlug = ContextEntityType | 'user';

/**
 * Generate a unique slug by trying candidates in order.
 */
export const generateUniqueSlug = async (
  ctx: DbContext,
  baseSlug: string,
  entityType: EntityTypeWithSlug,
): Promise<string> => {
  if (await checkSlugAvailable(ctx, baseSlug, entityType)) return baseSlug;

  const withSuffix = `${baseSlug}-${nanoid(6)}`;
  if (await checkSlugAvailable(ctx, withSuffix, entityType)) return withSuffix;

  // Fully random — virtually guaranteed to be unique
  return `${withSuffix}-${nanoid(10)}`;
};
