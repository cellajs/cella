import type { InsertMembershipModel } from '#/modules/memberships/memberships-db';
import { mockContextMembership } from '#/modules/memberships/memberships-mocks';
import { ORG_ID, TENANT_ID, userId } from './ids';

/**
 * Generate organization-level membership for a load-test user, using backend
 * mocks for a type-safe entity. Runs in Node.js (data-setup), not in Artillery
 * scenarios.
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
