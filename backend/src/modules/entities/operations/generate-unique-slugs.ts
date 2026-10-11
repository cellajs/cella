import { nanoid } from 'shared/utils/nanoid';
import type { DbContext } from '#/core/context';
import { checkSlugAvailable, type EntityTypeWithSlug } from '#/modules/entities/operations/check-slug';
import { slugFromName } from '#/utils/slug';

/** The shortest slug `validSlugSchema` accepts. */
const minSlugLength = 2;

const pickUniqueSlug = async (ctx: DbContext, baseSlug: string, entityType: EntityTypeWithSlug, taken: Set<string>): Promise<string> => {
  const isFree = async (slug: string) => !taken.has(slug) && (await checkSlugAvailable(ctx, slug, entityType));

  if (baseSlug.length >= minSlugLength && (await isFree(baseSlug))) return baseSlug;

  // A name that leaves no slug characters takes the entity type as its base, e.g. `course-section-x7k2p9`.
  const kebabType = entityType.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  const withSuffix = `${baseSlug || kebabType}-${nanoid(6)}`;
  if (await isFree(withSuffix)) return withSuffix;

  // Final fallback uses enough entropy that collisions are not expected.
  return `${withSuffix}-${nanoid(10)}`;
};

/**
 * Picks the slugs of rows whose slug the server chooses: each name slugified, with a random suffix when that slug is
 * taken or too short to be one. A name may be any base, such as a slug built from other slugs. Resolved one at a time
 * against the slugs given out earlier in the same call, which the database does not hold yet, so equal names in one
 * batch end up with different slugs. A slug that another request takes between this check and the insert still fails
 * on the unique index.
 * @param names - The names of the batch, in insert order.
 * @param entityType - The channel type, or `user`, whose table the slugs must be free in.
 * @returns One slug per name, in the same order, each passing `validSlugSchema`.
 */
export const generateUniqueSlugs = async (ctx: DbContext, names: string[], entityType: EntityTypeWithSlug): Promise<string[]> => {
  const taken = new Set<string>();
  const slugs: string[] = [];
  for (const name of names) {
    const slug = await pickUniqueSlug(ctx, slugFromName(name), entityType, taken);
    taken.add(slug);
    slugs.push(slug);
  }
  return slugs;
};
