import { generateMockEntityCounts, type MockEntityCounts } from './mock-entity-counts';
import { generateMockMembershipCounts, type MockMembershipCounts } from './mock-membership-counts';

/**
 * Generates full counts structure for organization responses.
 * Combines membership counts and entity counts dynamically.
 * @param key - Key for deterministic generation.
 */
export const generateMockFullCounts = (key: string): { membership: MockMembershipCounts; entities: MockEntityCounts } => ({
  membership: generateMockMembershipCounts(`${key}:membership`),
  entities: generateMockEntityCounts(`${key}:entities`),
});
