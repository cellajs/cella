import { faker } from '@faker-js/faker';
import { type ChannelEntityType, hierarchy, isProduct, recordFromKeys } from 'shared';
import { withFakerSeed } from '#/mocks/faker-seed';
import { generateMockMembershipCounts } from '#/mocks/mock-membership-counts';
import { mockRefDate } from '#/mocks/mock-timestamps';

/** Scoped to the channel's configured descendants, matching `channelIncludedSchema`. The hierarchy controls the keys. */
export const generateMockChannelCounts = (channelType: ChannelEntityType, key: string) => {
  const descendants = hierarchy.getOrderedDescendants(channelType);
  const productDescendants = descendants.filter(isProduct);

  const entities = withFakerSeed(`${key}:entities`, () => recordFromKeys(descendants, () => faker.number.int({ min: 0, max: 500 })));

  const activity = withFakerSeed(`${key}:activity`, () =>
    recordFromKeys(productDescendants, (): { created: number | null; updated: number | null } => {
      const created = faker.date.recent({ days: 30, refDate: mockRefDate });
      const updated = faker.datatype.boolean({ probability: 2 / 3 }) ? faker.date.between({ from: created, to: mockRefDate }).getTime() : null;
      return { created: created.getTime(), updated };
    }),
  );

  // Home-only twin capped by the subtree count, so mocks stay internally consistent.
  const entitiesSelf = withFakerSeed(`${key}:entitiesSelf`, () =>
    recordFromKeys(descendants, (entityType) => faker.number.int({ min: 0, max: entities[entityType] })),
  );

  return { membership: generateMockMembershipCounts(`${key}:membership`), entities, entitiesSelf, activity };
};
