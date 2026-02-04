import { appConfig, type ContextEntityType } from 'shared';
import { resolveEntity } from '#/lib/entity';

type EntityTypeWithSlug = ContextEntityType | 'user';

const entitiesWithSlug = [...appConfig.contextEntityTypes, 'user'] satisfies EntityTypeWithSlug[];

/**
 * Checks if a slug is available across context entity & user entity types. Resolves the availability of the slug for each entity.
 *
 * @param slug - The slug to check for availability.
 * @param entityType - (Optional) The type of entity to check against.
 * @returns Boolean(true if available, false if taken).
 */
export const checkSlugAvailable = async (slug: string, entityType?: EntityTypeWithSlug) => {
  const entities = entityType ? [entityType] : entitiesWithSlug;

  const promises = entities.map((entity) => resolveEntity(entity, slug));
  const results = await Promise.all(promises);

  // Check if any result is found, if so, slug is not available
  const isAvailable = results.every((result) => !result);

  return isAvailable;
};

/**
 * Batch check slug availability. Returns a Map of slug -> boolean (true = available).
 * @param slugs - Array of slugs to check.
 * @param entityType - (Optional) The type of entity to check against.
 */
export const checkSlugsAvailable = async (slugs: string[], entityType?: EntityTypeWithSlug) => {
  const results = await Promise.all(
    slugs.map(async (slug) => ({
      slug,
      available: await checkSlugAvailable(slug, entityType),
    })),
  );
  return new Map(results.map((r) => [r.slug, r.available]));
};
