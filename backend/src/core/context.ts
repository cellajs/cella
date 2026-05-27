import type { HttpBindings } from '@hono/node-server';
import type { DbOrTx } from '#/db/db';
import type { OrganizationModel } from '#/db/schema/organizations';
import type { TenantModel } from '#/db/schema/tenants';
import type { UserModel } from '#/db/schema/users';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';

/**
 * Set node server bindings.
 *
 * @link https://hono.dev/docs/getting-started/nodejs#access-the-raw-node-js-apis
 */
type Bindings = HttpBindings & {
  /* ... */
};

/** Minimal context for query functions that only need a database connection. */
export type DbContext = {
  var: Pick<Env['Variables'], 'db'>;
};

/** Authenticated tenant-scoped context — usable from Hono handlers, operations, and workers. */
export type AuthContext = {
  var: Omit<Env['Variables'], 'requestId'>;
};

/**
 * Define the context environment.
 */
export type Env = {
  Variables: {
    user: UserModel;
    userId: string;
    isSystemAdmin: boolean;
    organization: OrganizationModel & { membership: MembershipBaseModel | null };
    organizationId: string;
    memberships: (MembershipBaseModel & { createdBy: string | null })[];
    sessionToken: string;
    requestId: string;
    db: DbOrTx;
    tenantId: string;
    tenant: TenantModel;
  };
  Bindings: Bindings;
};
