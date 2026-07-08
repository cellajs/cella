import type { HttpBindings } from '@hono/node-server';
import type { DbOrTx } from '#/db/db';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import type { OrganizationModel } from '#/modules/organization/organization-db';
import type { TenantModel } from '#/modules/tenants/tenants-db';
import type { UserModel } from '#/modules/user/user-db';

/**
 * Set node server bindings.
 *
 * @link https://hono.dev/docs/getting-started/nodejs#access-the-raw-node-js-apis
 */
type Bindings = HttpBindings & {
  /* ... */
};

/**
 * Identity behind an MCP request. `user` actors are real Cella users (from an
 * Authorization Code token); `service` actors are OAuth clients authenticating
 * via client_credentials (e.g. flue/worker), authorized by the token's
 * audience-bound tenant/org rather than by membership. Set by `mcpAuthGuard`.
 */
export type McpActor =
  | { type: 'user'; userId: string; scopes: string[] }
  | { type: 'service'; clientId: string; scopes: string[] };

/** Minimal context for query functions that only need a database connection. */
export type DbContext = {
  var: Pick<Env['Variables'], 'db'>;
};

/** Authenticated tenant-scoped context for Hono handlers, operations, and workers. */
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
    /** Present only on MCP requests; identifies the token's user or service actor. */
    mcpActor: McpActor;
  };
  Bindings: Bindings;
};
