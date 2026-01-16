import { generateMockEntityCounts, type MockEntityCounts } from './entity-counts';
import { generateMockMembershipCounts, type MockMembershipCounts } from './membership-counts';

/**
 * Generates full counts structure for organization responses.
 * Combines membership counts and entity counts dynamically.
 */
export const generateMockFullCounts = (): { membership: MockMembershipCounts; entities: MockEntityCounts } => ({
  membership: generateMockMembershipCounts(),
  entities: generateMockEntityCounts(),
});
