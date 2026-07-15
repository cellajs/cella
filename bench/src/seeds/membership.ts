import type { InsertMembershipModel } from '#/modules/memberships/memberships-db';
import { mockChannelMembership } from '#/modules/memberships/memberships-mocks';
import { ORG_ID, TENANT_ID, userId } from './ids';

export const loadtestOrgMembership = (userIndex: number): InsertMembershipModel => {
  const membership = mockChannelMembership(
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
