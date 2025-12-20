import { appConfig, type ContextEntityType } from 'config';
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
