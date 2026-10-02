import type { Context } from 'hono';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { hasPendingInvitation } from '#/modules/auth/invitations/operations/may-sign-up';
import type { IdentityModel } from '#/modules/auth/oauth/identities-db';
import { insertIdentity } from '#/modules/auth/oauth/identities-queries';
import type { SsoClaims } from '#/modules/auth/sso/helpers/federation-client';
import type { Federation } from '#/modules/auth/sso/helpers/federations';
import { newUserFromProfile, type SsoProfile } from '#/modules/auth/sso/helpers/transform-sso-claims';
import { rememberSsoCollision } from '#/modules/auth/sso/operations/sso-recovery';
import { roleFromClaims } from '#/modules/auth/sso/role-from-claims';
import type { ConnectionModel } from '#/modules/connections/connections-db';
import { findPendingOrganizationInvitation } from '#/modules/memberships/memberships-queries';
import { insertMemberships } from '#/modules/memberships/operations/insert-memberships';
import { findOrganizationByTenant } from '#/modules/organization/organization-queries';
import type { UserWithCounters } from '#/modules/user/helpers/select';
import { handleCreateUser } from '#/modules/user/operations/create-account';
import { findUserByEmail, findUserById } from '#/modules/user/user-queries';
import { log } from '#/utils/logger';

const dbCtx = { var: { db: baseDb } };

/** One verified SSO sign-in, resolved against its connection: what the completion flows act on. */
export interface SsoSignInFacts {
  federation: Federation;
  connection: ConnectionModel;
  /** Every verified claim of the sign-in: what the role seam reads. */
  claims: SsoClaims;
  profile: SsoProfile;
  /** The claims kept on the identity row. */
  snapshot: Record<string, unknown>;
  subject: string;
  /** The identity the subject already is, when the account signed in before. */
  identity: IdentityModel | undefined;
}

/**
 * Creates the account of a first SSO sign-in: the user with its address proven by the institution, the verified
 * identity, and a membership in the tenant's organization with the role `roleFromClaims` gives, unless an invitation to
 * that organization names the role (bound to the account on creation, granted when accepted). The connection admits the
 * institution's members when its `jitProvisioning` is on; off, an invitation to the address is required.
 * @throws AppError 400 `sso_email_missing` without an address, 409 `sso_email_exists` when an account holds it,
 *   403 `sign_up_restricted` when neither the connection nor an invitation admits the address.
 */
export const provisionSsoUser = async (
  ctx: Context<Env>,
  { federation, connection, claims, profile, snapshot, subject }: SsoSignInFacts,
): Promise<UserWithCounters> => {
  const email = profile.email;
  if (!email) throw new AppError(400, 'sso_email_missing', 'warn', { meta: { strategy: federation.key } });

  // The holder signs in with their own method and connects the institution account from the account page. This is
  // also where an account lands whose identifier at the institution changed. The error page offers a sign-in link to
  // the asserted address, which this browser may ask for once (`sendSsoRecoveryLinkOp`).
  if (await findUserByEmail(dbCtx, { email })) {
    await rememberSsoCollision(ctx, { email, connectionId: connection.id });
    throw new AppError(409, 'sso_email_exists', 'warn', { meta: { strategy: federation.key } });
  }

  if (!connection.jitProvisioning && !(await hasPendingInvitation(dbCtx, { email }))) {
    throw new AppError(403, 'sign_up_restricted', 'info', { meta: { strategy: federation.key } });
  }

  const organization = await findOrganizationByTenant(dbCtx, { tenantId: connection.tenantId });

  const created = await baseDb.transaction(async (tx) => {
    const txCtx = { var: { db: tx } };
    const user = await handleCreateUser(txCtx, { newUser: newUserFromProfile({ ...profile, email }), via: federation.key });

    await insertIdentity(txCtx, {
      values: { userId: user.id, kind: 'sso', issuer: federation.key, subject, email, connectionId: connection.id, data: snapshot },
      verified: true,
    });

    if (organization && !(await findPendingOrganizationInvitation(txCtx, { email, organizationId: organization.id }))) {
      const role = roleFromClaims({ federation: federation.key, connection, claims });
      await insertMemberships(txCtx, {
        items: [{ userId: user.id, role, entity: { ...organization, tenantId: connection.tenantId }, createdBy: user.id }],
      });
    }

    return user;
  });

  log.info('User provisioned through SSO', { userId: created.id, strategy: federation.key, connectionId: connection.id });

  const user = await findUserById(dbCtx, { id: created.id });
  if (!user) throw new AppError(404, 'not_found', 'error', { entityType: 'user' });
  return user;
};
