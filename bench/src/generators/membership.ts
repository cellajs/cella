/**
 * Load-test membership generator — uses backend mocks for type-safe records.
 * Runs in Node.js (data-setup), not in k6.
 */
import { mockContextMembership } from '../../../backend/mocks/mock-membership';
import type { InsertMembershipModel } from '../../../backend/src/db/schema/memberships';
import { ORG_ID, TENANT_ID, userId } from './ids';

/**
 * Generate organization-level membership for a load-test user.
 */
export const loadtestOrgMembership = (userIndex: number): InsertMembershipModel => {
  const membership = mockContextMembership(
    'organization',
    { id: ORG_ID, tenantId: TENANT_ID },
    { id: userId(userIndex) },
  );
  return {
    ...membership,
    role: 'admin',
    createdBy: userId(0),
    displayOrder: userIndex + 1,
    archived: false,
    muted: false,
  };
};
