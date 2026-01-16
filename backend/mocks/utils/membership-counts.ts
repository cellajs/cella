import { faker } from '@faker-js/faker';

/**
 * Membership count structure for organizations.
 */
export interface MockMembershipCounts {
  admin: number;
  member: number;
  pending: number;
  total: number;
}

/**
 * Generates mock membership counts for an organization.
 */
export const generateMockMembershipCounts = (): MockMembershipCounts => {
  const admin = faker.number.int({ min: 1, max: 5 });
  const member = faker.number.int({ min: 0, max: 20 });
  const pending = faker.number.int({ min: 0, max: 5 });
  return {
    admin,
    member,
    pending,
    total: admin + member,
  };
};
