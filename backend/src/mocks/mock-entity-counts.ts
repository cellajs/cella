import { faker } from '@faker-js/faker';
import { appConfig, type EntityType } from 'shared';
import { withFakerSeed } from './faker-seed';

// Entity count schema should exclude 'user' and 'organization'
type FilteredEntityType = Exclude<EntityType, 'user' | 'organization'>;

const isFilteredEntityType = (entityType: EntityType): entityType is FilteredEntityType => {
  return entityType !== 'user' && entityType !== 'organization';
};

/**
 * Type for dynamically generated entity counts in mocks.
 * Excludes 'user' and 'organization' from counts, matching the schema pattern.
 */
export type MockEntityCounts = {
  [K in FilteredEntityType]: number;
};

/**
 * Generates mock entity counts dynamically based on appConfig.entityTypes.
 * Excludes 'user' and 'organization' to match fullCountsSchema pattern.
 * @param key - Key for deterministic generation.
 */
export const generateMockEntityCounts = (key: string): MockEntityCounts => {
  const generator = (): MockEntityCounts =>
    Object.fromEntries(
      appConfig.entityTypes
        .filter(isFilteredEntityType)
        .map((entityType) => [entityType, faker.number.int({ min: 0, max: 500 })]),
    ) as MockEntityCounts;

  return withFakerSeed(key, generator);
};
