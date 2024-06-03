import { config } from 'config';
import { resolveEntity } from '../../../lib/entity';

// * Check if a slug is available in any of the entities
export const checkSlugAvailable = async (slug: string) => {
  const entities = config.entityTypes;

  const promises = entities.map((entity) => resolveEntity(entity, slug));
  const results = await Promise.all(promises);

  // Check if any result is found, if so, slug is not available
  const isAvailable = results.every((result) => !result);

  return isAvailable;
};
