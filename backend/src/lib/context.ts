import type { HttpBindings } from '@hono/node-server';
import type * as Sentry from '@sentry/node';
import { getContext } from 'hono/context-storage';
import type { OrganizationModel } from '#/db/schema/organizations';
import type { TokenModel } from '#/db/schema/tokens';
import type { UserModel } from '#/db/schema/users';
import type { MembershipSummary } from '#/modules/memberships/helpers/select';

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
 *
 * @link https://hono.dev/docs/middleware/builtin/context-storage#usage
 */
export type Env = {
  Variables: {
    user: UserModel;
    organization: OrganizationModel & { membership: MembershipSummary | null };
    memberships: MembershipSummary[];
    token: TokenModel;
    logId: string;
    sentry: typeof Sentry;
    sentrySpan?: ReturnType<typeof Sentry.startSpan>;
  };
  Bindings: Bindings;
};

/**
 * Access the current user from the request context.
 *
 * @returns The `UserModel` object of the currently authenticated user.
 */
export const getContextUser = () => {
  return getContext<Env>().var.user;
};

/**
 * Access the current organization that the request is scoped to.
 * This includes both the organization and the membership of current user.
 *
 * @returns The `OrganizationModel` along with its associated `MembershipModel`.
 */
export const getContextOrganization = () => {
  return getContext<Env>().var.organization;
};

/**
 * Access all memberships for the current user.
 *
 * @returns An array of `MembershipModel` objects for the current user.
 */
export const getContextMemberships = () => {
  return getContext<Env>().var.memberships;
};

/**
 * Access authentication token associated with the current user.
 *
 * @returns The `TokenModel` object that represents the user's authentication token.
 */
export const getContextToken = () => {
  return getContext<Env>().var.token;
};
