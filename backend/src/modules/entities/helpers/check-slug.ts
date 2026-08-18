import type { ChannelEntityType } from 'shared';
import type { DbContext } from '#/core/context';
import { resolveEntity } from '#/modules/entities/entities-queries';

type EntityTypeWithSlug = ChannelEntityType | 'user';

export const checkSlugAvailable = async (ctx: DbContext, slug: string, entityType: EntityTypeWithSlug) => {
  const result = await resolveEntity(ctx, { entityType, identifier: slug, bySlug: true });
  return !result;
};

/** Returns a Map of slug to availability; true means free. */
export const checkSlugsAvailable = async (ctx: DbContext, slugs: string[], entityType: EntityTypeWithSlug) => {
  const results = await Promise.all(
    slugs.map(async (slug) => ({
      slug,
      available: await checkSlugAvailable(ctx, slug, entityType),
    })),
  );
  return new Map(results.map((r) => [r.slug, r.available]));
};
