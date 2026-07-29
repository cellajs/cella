import { faker } from '@faker-js/faker';
import { type EntityRole, roles } from 'shared';
import { withFakerSeed } from './faker-seed';

/** Generates deterministic membership counts for every configured role. */
export const generateMockMembershipCounts = (key: string) =>
  withFakerSeed(key, () => {
    const roleCounts = {} as Record<EntityRole, number>;
    let total = 0;

    for (const role of roles.all) {
      // First role gets at least 1 (typically admin), others can be 0
      const isFirstRole = role === roles.all[0];
      const count = faker.number.int({ min: isFirstRole ? 1 : 0, max: isFirstRole ? 50 : 200 });
      roleCounts[role] = count;
      total += count;
    }

    return {
      ...roleCounts,
      pending: faker.number.int({ min: 0, max: 50 }),
      total,
    };
  });
