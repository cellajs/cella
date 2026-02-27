import type { HttpBindings } from '@hono/node-server';
import type * as Sentry from '@sentry/node';
import type { DbOrTx } from '#/db/db';
import type { OrganizationModel } from '#/db/schema/organizations';
import type { TenantModel } from '#/db/schema/tenants';
import type { TokenModel } from '#/db/schema/tokens';
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

/**
 * Define the context environment.
 * NOTE: Only direct ctx.var. Pattern with contextStorage() / getContext should not be used to avoid indirection and uncertainties.
 */
export type Env = {
  Variables: {
    user: UserModel;
    isSystemAdmin: boolean;
    organization: OrganizationModel & { membership: MembershipBaseModel | null };
    memberships: (MembershipBaseModel & { createdBy: string | null })[];
    token: TokenModel;
    sessionToken: string;
    requestId: string;
    sentry: typeof Sentry;
    sentrySpan?: ReturnType<typeof Sentry.startSpan>;
    /** Database connection - either raw db (non-RLS routes) or RLS-scoped transaction (tenant routes) */
    db: DbOrTx;
    tenantId: string;
    tenant: TenantModel;
  };
  Bindings: Bindings;
};
