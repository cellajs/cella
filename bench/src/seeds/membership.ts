/**
 * Load-test membership seed helper — uses backend mocks for type-safe records.
 * Runs in Node.js (data-setup), not in k6.
 */

import type { InsertMembershipModel } from '#/modules/memberships/memberships-db';
import { mockContextMembership } from '#/modules/memberships/memberships-mocks';
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
