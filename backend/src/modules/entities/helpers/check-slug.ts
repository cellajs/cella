import type { ContextEntityType } from 'shared';
import type { DbContext } from '#/core/context';
import { resolveEntity } from '#/modules/entities/entities-queries';

type EntityTypeWithSlug = ContextEntityType | 'user';

/**
 * Checks if a slug is available for a specific entity type.
 */
export const checkSlugAvailable = async (ctx: DbContext, slug: string, entityType: EntityTypeWithSlug) => {
  const result = await resolveEntity(ctx, entityType, slug, true);
  return !result;
};

/**
 * Batch check slug availability. Returns a Map of slug -> boolean (true = available).
 */
export const checkSlugsAvailable = async (ctx: DbContext, slugs: string[], entityType: EntityTypeWithSlug) => {
  const results = await Promise.all(
    slugs.map(async (slug) => ({
      slug,
      available: await checkSlugAvailable(ctx, slug, entityType),
    })),
  );
  return new Map(results.map((r) => [r.slug, r.available]));
};
