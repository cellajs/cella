import { extractEntity } from '../../../lib/extract-entity';

// * Check if a slug is available in any of the entities
export const checkSlugAvailable = async (slug: string) => {
  const entities: ('ORGANIZATION' | 'WORKSPACE' | 'PROJECT' | 'USER')[] = ['ORGANIZATION', 'WORKSPACE', 'PROJECT', 'USER'];

  const promises = entities.map((entity: 'ORGANIZATION' | 'WORKSPACE' | 'PROJECT' | 'USER') => extractEntity(entity, slug));
  const results = await Promise.all(promises);

  let isAvailable = true;

  for (const result of results) {
    if (result) isAvailable = false
  }

  return isAvailable;
};
