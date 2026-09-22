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

/**
 * Three context types, narrowest first; type an operation on the narrowest one it needs:
 *
 * - `DbContext`: a database connection and nothing else (queries, background jobs).
 * - `ActorContext`: someone is acting (a user today, a service account later) inside a tenant. Carries `actor`
 *   with the id and grants the permission engine reads, plus tenant and organization scope. No user row.
 * - `AuthContext`: a signed-in user. Everything in `ActorContext` plus `user`, `memberships` and the session.
 *
 * `AuthContext` is assignable to `ActorContext`, which is assignable to `DbContext`, so a handler with a
 * session can call any of them. The reverse is a type error: an operation on `ActorContext` cannot read
 * `ctx.var.user`, which is what keeps it callable from machine credentials.
 */

/** Minimal context for query functions that only need a database connection. */
export type DbContext = {
  var: Pick<Env['Variables'], 'db'>;
};

/**
 * The principal a request runs as (a user today, a service account later) and the role bindings the permission
 * engine reads for it. `id` is what provenance columns and the engine's `own` condition compare against.
 */
export type Actor = { kind: PrincipalKind; id: string; grants: MembershipBaseModel[] };

/**
 * Context for operations a machine actor may call: the actor and the tenant scope, but no user row. An operation
 * typed on this cannot read `ctx.var.user`, so it stays callable from every credential kind.
 */
export type ActorContext = {
  var: Pick<
    Env['Variables'],
    'actor' | 'isSystemAdmin' | 'db' | 'tenantId' | 'tenant' | 'organization' | 'organizationId'
  >;
};

/** Authenticated user context for Hono handlers, operations, and workers; a subtype of `ActorContext`. */
export type AuthContext = {
  var: Omit<Env['Variables'], 'requestId'>;
};

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
