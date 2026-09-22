import type { HttpBindings } from '@hono/node-server';
import type { DbOrTx } from '#/db/db';
import type { AuthStrategy } from '#/modules/auth/sessions-db';
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

/** The principal a request runs as: a user today, a service account later. */
export type ActorRef = { kind: PrincipalKind; id: string };

/** What proved the actor. Sessions today; keys and tokens once machine access exists. */
export type CredentialRef = { kind: 'session'; id: string };

/**
 * Context for operations a machine actor may call: the principal, its grants and the tenant scope, but no user row.
 * An operation typed on this cannot read `ctx.var.user`, so it stays callable from every credential kind.
 */
export type ActorContext = {
  var: Omit<Env['Variables'], 'requestId' | 'user' | 'userId' | 'memberships' | 'sessionToken' | 'sessionId'>;
};

/** Authenticated user context for Hono handlers, operations, and workers; a subtype of `ActorContext`. */
export type AuthContext = {
  var: Omit<Env['Variables'], 'requestId'>;
};

export type Env = {
  Variables: {
    actor: ActorRef;
    /** `actor.id`: what provenance columns and the permission engine's `own` condition compare against. */
    principalId: string;
    /** Role bindings the engine reads: a user's memberships today; Phase B widens the element type for service grants. */
    grants: MembershipBaseModel[];
    /** Credential mask over the grants; null means unmasked. */
    scopes: string[] | null;
    credential: CredentialRef | null;
    /** Strategy of the session that authenticated the actor (or authorized its token); null for service actors. */
    authStrategy: AuthStrategy | null;
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
