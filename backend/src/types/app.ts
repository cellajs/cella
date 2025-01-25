import type { HttpBindings } from '@hono/node-server';
import type { MembershipModel } from '#/db/schema/memberships';
import type { OrganizationModel } from '#/db/schema/organizations';
import type { UserModel } from '#/db/schema/users';

// Access node server bindings
// https://hono.dev/docs/getting-started/nodejs#access-the-raw-node-js-apis
type Bindings = HttpBindings & {
  /* ... */
};

// Middleware env is app-specific
export type Env = {
  Variables: {
    user: UserModel;
    organization: OrganizationModel;
    memberships: [MembershipModel];
  };
  Bindings: Bindings;
};
