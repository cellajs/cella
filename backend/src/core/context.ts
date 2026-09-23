import type { HttpBindings } from '@hono/node-server';
import type { AccessScope } from 'shared';
import type { DbOrTx } from '#/db/db';
import type { ServiceAccountId, UserId } from '#/db/utils/ids';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import type { OrganizationModel } from '#/modules/organization/organization-db';
import type { RoleBinding } from '#/modules/service-accounts/service-accounts-db';
import type { TenantModel } from '#/modules/tenants/tenants-db';
import type { UserModel } from '#/modules/user/user-db';

/** @link https://hono.dev/docs/getting-started/nodejs#access-the-raw-node-js-apis */
type Bindings = HttpBindings & {
  /* ... */
};

/** A user: its bindings are its membership rows; a session is unmasked, a delegated token (OAuth) carries the token's scopes. */
type UserActor = { kind: 'user'; id: UserId; bindings: MembershipBaseModel[]; scopes: readonly AccessScope[] | null };

/** A service account behind an API key: `bindings` are its stored role bindings, `scopes` the key's mask (null = unmasked). */
type ServiceActor = {
  kind: 'service';
  id: ServiceAccountId;
  tenantId: string;
  bindings: RoleBinding[];
  scopes: readonly AccessScope[] | null;
};

/**
 * The principal a request runs as, with the role bindings the permission engine reads. `id` is what provenance
 * columns and the engine's `own` condition compare against; a binding is read for its channel, organization and role.
 */
export type Actor = UserActor | ServiceActor;
export type ActorBinding = Actor['bindings'][number];

/** Minimal context for query functions that only need a database connection. */
export type DbContext = {
  var: Pick<Env['Variables'], 'db'>;
};

/**
 * Someone acting inside a tenant, whatever proved them: no user row, so it stays callable with an API key or an access token.
 * The organization fields are present only behind `orgGuard`; operations that need them take `OrgContext`.
 */
export type ActorContext = {
  var: Pick<Env['Variables'], 'actor' | 'isSystemAdmin' | 'db' | 'tenantId' | 'tenant'> &
    Partial<Pick<Env['Variables'], 'organization' | 'organizationId'>>;
};

/** An actor inside a resolved organization: what `orgGuard` guarantees. */
export type OrgContext = {
  var: ActorContext['var'] & Pick<Env['Variables'], 'organization' | 'organizationId'>;
};

/**
 * A signed-in user: everything in `OrgContext` plus `user`, `memberships` and the session. `userGuard` guarantees the
 * actor is a `UserActor`; the type keeps the union because Hono hands every handler the same `Env`.
 */
export type UserContext = {
  var: Omit<Env['Variables'], 'requestId'>;
};

/**
 * Request variables; the derived contexts pick from them, narrowest first: `DbContext` (a connection),
 * `ActorContext` (someone acting inside a tenant, no user row), `OrgContext` (plus the organization), `UserContext`
 * (a signed-in user). Each is assignable to the one before it, so type an operation on the narrowest it needs;
 * `ctx.var.user` is a type error on all but the last.
 */
export type Env = {
  Variables: {
    actor: Actor;
    user: UserModel;
    /** User-only sugar for `actor.id`, kept for the user-only modules. */
    userId: UserId;
    isSystemAdmin: boolean;
    organization: OrganizationModel & { membership: MembershipBaseModel | null };
    organizationId: string;
    /** User-only sugar for `actor.bindings`, with the inviter's id; a service actor has no memberships. */
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
