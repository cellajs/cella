import { getContext } from 'hono/context-storage';

import type { HttpBindings } from '@hono/node-server';
import type { MembershipModel } from '#/db/schema/memberships';
import type { OrganizationModel } from '#/db/schema/organizations';
import type { TokenModel } from '#/db/schema/tokens';
import type { UserModel } from '#/db/schema/users';

// Access node server bindings
// https://hono.dev/docs/getting-started/nodejs#access-the-raw-node-js-apis
type Bindings = HttpBindings & {
  /* ... */
};

// Define the context environment
// https://hono.dev/docs/middleware/builtin/context-storage#usage
export type Env = {
  Variables: {
    user: UserModel;
    organization: OrganizationModel & { membership: MembershipModel };
    memberships: [MembershipModel];
    token: TokenModel;
  };
  Bindings: Bindings;
};

// Access current user
export const getContextUser = () => {
  return getContext<Env>().var.user;
};

// Access the current organization that the request is scoped to
export const getContextOrganization = () => {
  return getContext<Env>().var.organization;
};

// Access all memberships for the current user
// TODO: currently not scoped for organization contexts?
export const getContextMemberships = () => {
  return getContext<Env>().var.memberships;
};

export const getContextToken = () => {
  return getContext<Env>().var.token;
};
