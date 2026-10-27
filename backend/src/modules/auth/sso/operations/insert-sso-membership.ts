import type { DbContext } from '#/core/context';
import type { SsoSignInFacts } from '#/modules/auth/sso/operations/complete-sso-sign-in';
import { roleFromClaims } from '#/modules/auth/sso/role-from-claims';
import { insertMemberships } from '#/modules/memberships/operations/insert-memberships';
import type { OrganizationModel } from '#/modules/organization/organization-db';

type InsertSsoMembershipOpts = Pick<SsoSignInFacts, 'federation' | 'connection' | 'claims'> & {
  userId: string;
  /** The organization of the connection's tenant. */
  organization: OrganizationModel;
};

/**
 * The membership an institution sign-in grants in its tenant's organization, with the role `roleFromClaims` gives for
 * every verified claim of the sign-in. The caller decides whether the user gets one, in its own transaction.
 */
export const insertSsoMembership = async (ctx: DbContext, { userId, organization, federation, connection, claims }: InsertSsoMembershipOpts) => {
  const role = roleFromClaims({ federation: federation.key, connection, claims });
  await insertMemberships(ctx, { items: [{ userId, role, entity: organization, createdBy: userId }] });
};
