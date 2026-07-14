import { generateMockActivityStamps, type MockActivityStamps } from './mock-activity-stamps';
import { generateMockEntityCounts, type MockEntityCounts } from './mock-entity-counts';
import { generateMockMembershipCounts, type MockMembershipCounts } from './mock-membership-counts';

/**
 * Generates full counts structure for organization responses.
 * Combines membership counts, entity counts and activity stamps dynamically.
 * @param key - Key for deterministic generation.
 */
export const generateMockFullCounts = (
  key: string,
): { membership: MockMembershipCounts; entities: MockEntityCounts; activity: MockActivityStamps } => ({
  membership: generateMockMembershipCounts(`${key}:membership`),
  entities: generateMockEntityCounts(`${key}:entities`),
  activity: generateMockActivityStamps(`${key}:activity`),
});
