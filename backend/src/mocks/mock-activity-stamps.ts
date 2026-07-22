import { faker } from '@faker-js/faker';
import { appConfig, type ProductEntityType } from 'shared';
import { withFakerSeed } from './faker-seed';
import { MOCK_REF_DATE } from './mock-timestamps';

/**
 * Epoch-ms timestamps per product entity type: `created` = latest post (null when
 * never posted), `updated` = latest content update (null when never updated),
 * matching the `activity` object in channelIncludedSchema counts.
 */
export type MockActivityStamps = {
  [K in ProductEntityType]: { created: number | null; updated: number | null };
};

/**
 * Generates mock activity stamps dynamically based on appConfig.productEntityTypes.
 * @param key - Key for deterministic generation.
 */
export const generateMockActivityStamps = (key: string): MockActivityStamps => {
  const generator = (): MockActivityStamps =>
    Object.fromEntries(
      appConfig.productEntityTypes.map((entityType) => {
        const created = faker.date.recent({ days: 30, refDate: MOCK_REF_DATE });
        // Roughly a third of streams were never updated after the last post
        const updated = faker.datatype.boolean({ probability: 2 / 3 })
          ? faker.date.between({ from: created, to: MOCK_REF_DATE }).getTime()
          : null;
        return [entityType, { created: created.getTime(), updated }];
      }),
    ) as MockActivityStamps;

  return withFakerSeed(key, generator);
};
