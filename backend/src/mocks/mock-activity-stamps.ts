import { faker } from '@faker-js/faker';
import { appConfig, type ProductEntityType } from 'shared';
import { withFakerSeed } from './faker-seed';
import { MOCK_REF_DATE } from './mock-timestamps';

/**
 * Type for dynamically generated per-stream activity stamps in mocks.
 * One epoch-ms timestamp (or null when never posted) per product entity type,
 * matching the `activity` object in contextEntityIncludedSchema counts.
 */
export type MockActivityStamps = {
  [K in ProductEntityType]: number | null;
};

/**
 * Generates mock activity stamps dynamically based on appConfig.productEntityTypes.
 * @param key - Key for deterministic generation.
 */
export const generateMockActivityStamps = (key: string): MockActivityStamps => {
  const generator = (): MockActivityStamps =>
    Object.fromEntries(
      appConfig.productEntityTypes.map((entityType) => [
        entityType,
        faker.date.recent({ days: 30, refDate: MOCK_REF_DATE }).getTime(),
      ]),
    ) as MockActivityStamps;

  return withFakerSeed(key, generator);
};
