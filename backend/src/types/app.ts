import type { User } from 'lucia';
import type { MembershipModel } from '#/db/schema/memberships';
import type { OrganizationModel } from '#/db/schema/organizations';

// Middleware env is app-specific
export type Env = {
  Variables: {
    user: User;
    organization: OrganizationModel;
    memberships: [MembershipModel];
  };
};
