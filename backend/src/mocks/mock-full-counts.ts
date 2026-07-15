import { generateMockActivityStamps, type MockActivityStamps } from './mock-activity-stamps';
import { generateMockEntityCounts, type MockEntityCounts } from './mock-entity-counts';
import { generateMockMembershipCounts, type MockMembershipCounts } from './mock-membership-counts';

/**
 * Full counts (membership + entities + activity) for organization responses.
 * @param key - seeds deterministic generation.
 */
export const generateMockFullCounts = (
  key: string,
): { membership: MockMembershipCounts; entities: MockEntityCounts; activity: MockActivityStamps } => ({
  membership: generateMockMembershipCounts(`${key}:membership`),
  entities: generateMockEntityCounts(`${key}:entities`),
  activity: generateMockActivityStamps(`${key}:activity`),
});
