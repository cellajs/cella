import { faker } from '@faker-js/faker';
import { type ChannelEntityType, type EntityType, hierarchy, isProduct, type ProductEntityType } from 'shared';
import { withFakerSeed } from './faker-seed';
import { generateMockMembershipCounts } from './mock-membership-counts';
import { MOCK_REF_DATE } from './mock-timestamps';

/**
 * Counts scoped to one channel's configured descendants, matching `channelIncludedSchema`.
 * The hierarchy controls the keys, so deeper apps need no mock-specific branches.
 */
export const generateMockChannelCounts = (channelType: ChannelEntityType, key: string) => {
  const descendants = hierarchy.getOrderedDescendants(channelType);
  const productDescendants = descendants.filter(isProduct);

  const entities = withFakerSeed(
    `${key}:entities`,
    () =>
      Object.fromEntries(
        descendants.map((entityType) => [entityType, faker.number.int({ min: 0, max: 500 })]),
      ) as Partial<Record<EntityType, number>>,
  );

  const activity = withFakerSeed(
    `${key}:activity`,
    () =>
      Object.fromEntries(
        productDescendants.map((entityType) => {
          const created = faker.date.recent({ days: 30, refDate: MOCK_REF_DATE });
          const updated = faker.datatype.boolean({ probability: 2 / 3 })
            ? faker.date.between({ from: created, to: MOCK_REF_DATE }).getTime()
            : null;
          return [entityType, { created: created.getTime(), updated }];
        }),
      ) as Partial<Record<ProductEntityType, { created: number | null; updated: number | null }>>,
  );

  return {
    membership: generateMockMembershipCounts(`${key}:membership`),
    entities,
    activity,
  };
};
