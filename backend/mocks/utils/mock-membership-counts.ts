import { faker } from '@faker-js/faker';
import { appConfig } from 'config';
import { withFakerSeed } from './faker-seed';

type EntityRole = (typeof appConfig.roles.entityRoles)[number];

/**
 * Membership count structure for organizations.
 * Dynamically includes counts for each entity role from config.
 */
export type MockMembershipCounts = {
  [K in EntityRole]: number;
} & {
  pending: number;
  total: number;
};

/**
 * Generates mock membership counts for an organization.
 * Dynamically generates counts for each entity role defined in config.
 * @param key - Key for deterministic generation.
 */
export const generateMockMembershipCounts = (key: string): MockMembershipCounts => {
  const generator = (): MockMembershipCounts => {
    const roleCounts = {} as Record<EntityRole, number>;
    let total = 0;

    for (const role of appConfig.roles.entityRoles) {
      // First role gets at least 1 (typically admin), others can be 0
      const isFirstRole = role === appConfig.roles.entityRoles[0];
      const count = faker.number.int({ min: isFirstRole ? 1 : 0, max: isFirstRole ? 50 : 200 });
      roleCounts[role] = count;
      total += count;
    }

    return {
      ...roleCounts,
      pending: faker.number.int({ min: 0, max: 50 }),
      total,
    };
  };

  return withFakerSeed(key, generator);
};
