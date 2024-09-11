import type { MembershipModel } from '#/db/schema/memberships';
import type { OrganizationModel } from '#/db/schema/organizations';
import type { User } from 'lucia';

// Middleware env is app-specific
export type Env = {
  Variables: {
    user: User;
    organization: OrganizationModel;
    memberships: [MembershipModel];
    allowedIds: Array<string>;
    disallowedIds: Array<string>;
  };
};
