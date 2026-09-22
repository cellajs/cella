import type { HttpBindings } from '@hono/node-server';
import type { DbOrTx } from '#/db/db';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import type { OrganizationModel } from '#/modules/organization/organization-db';
import type { PrincipalKind } from '#/modules/principals/principals-db';
import type { TenantModel } from '#/modules/tenants/tenants-db';
import type { UserModel } from '#/modules/user/user-db';

/** @link https://hono.dev/docs/getting-started/nodejs#access-the-raw-node-js-apis */
type Bindings = HttpBindings & {
  /* ... */
};

/** Minimal context for query functions that only need a database connection. */
export type DbContext = {
  var: Pick<Env['Variables'], 'db'>;
};

/**
 * The principal a request runs as (a user today, a service account later) and the role bindings the permission
 * engine reads for it. `id` is what provenance columns and the engine's `own` condition compare against.
 */
export type Actor = { kind: PrincipalKind; id: string; grants: MembershipBaseModel[] };

/** Someone acting inside a tenant, whatever proved them: no user row, so it stays callable from machine credentials. */
export type ActorContext = {
  var: Pick<
    Env['Variables'],
    'actor' | 'isSystemAdmin' | 'db' | 'tenantId' | 'tenant' | 'organization' | 'organizationId'
  >;
};

/** A signed-in user: everything in `ActorContext` plus `user`, `memberships` and the session. */
export type UserContext = {
  var: Omit<Env['Variables'], 'requestId'>;
};

/**
 * Request variables; the three derived contexts pick from them, narrowest first: `DbContext` (a connection),
 * `ActorContext` (someone acting inside a tenant, no user row), `UserContext` (a signed-in user). Each is assignable
 * to the one before it, so type an operation on the narrowest it needs; `ctx.var.user` is a type error on the first two.
 */
export type Env = {
  Variables: {
    actor: Actor;
    user: UserModel;
    userId: string;
    isSystemAdmin: boolean;
    organization: OrganizationModel & { membership: MembershipBaseModel | null };
    organizationId: string;
    memberships: (MembershipBaseModel & { createdBy: string | null })[];
    sessionToken: string;
    /** Row id of the authenticated session, so long-lived connections can be closed when it ends. */
    sessionId: string;
    requestId: string;
    db: DbOrTx;
    tenantId: string;
    tenant: TenantModel;
  };
  Bindings: Bindings;
};
