import type { Context } from 'hono';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { hasPendingInvitation } from '#/modules/auth/invitations/operations/may-sign-up';
import { insertIdentity } from '#/modules/auth/oauth/identities-queries';
import { provesAddress } from '#/modules/auth/sso/helpers/address-authority';
import { newUserFromProfile } from '#/modules/auth/sso/helpers/transform-sso-claims';
import type { SsoSignInFacts } from '#/modules/auth/sso/operations/complete-sso-sign-in';
import { insertSsoMembership } from '#/modules/auth/sso/operations/insert-sso-membership';
import { rememberSsoCollision } from '#/modules/auth/sso/operations/sso-recovery';
import { findPendingOrganizationInactiveMembership } from '#/modules/memberships/inactive-memberships-queries';
import { findOrganizationByTenant } from '#/modules/organization/organization-queries';
import type { UserWithActivity } from '#/modules/user/helpers/select';
import { createAccount } from '#/modules/user/operations/create-account';
import { findUserByEmail, findUserById } from '#/modules/user/user-queries';
import { log } from '#/utils/logger';

const dbCtx = { var: { db: baseDb } };

/**
 * Creates the account of a first SSO sign-in: the user with the address the institution proves (`provesAddress`), the
 * verified identity and, with the connection's `jitProvisioning`, a membership in the tenant's organization with the
 * role `roleFromClaims` gives, unless an invitation to that organization names the role (bound to the account on
 * creation, granted when accepted). Without `jitProvisioning` an invitation to the address is required, and the
 * sign-in grants no membership of its own.
 * @throws AppError 400 `sso_email_missing` without an address, 409 `sso_email_unproven` for an address the institution
 *   does not prove, 409 `sso_email_exists` when an account holds it, 403 `sign_up_restricted` when neither the
 *   connection nor an invitation admits the address.
 */
export const provisionSsoUser = async (
  ctx: Context<Env>,
  { federation, connection, claims, profile, snapshot, subject }: SsoSignInFacts,
): Promise<UserWithActivity> => {
  const email = profile.email;
  if (!email) throw new AppError(400, 'sso_email_missing', 'warn', { meta: { strategy: federation.key } });

  // Refused before the lookup, so it tells nothing about who holds the address; the error page offers a magic link.
  if (!provesAddress(federation, connection, email)) {
    rememberSsoCollision(ctx, { email, connectionId: connection.id });
    throw new AppError(409, 'sso_email_unproven', 'warn', { meta: { strategy: federation.key } });
  }

  // The holder signs in with their own method and connects the institution account from the account page. An account
  // whose identifier at the institution changed meets this refusal too. The error page offers a sign-in link to the
  // asserted address, which this browser may ask for once (`sendSsoRecoveryLinkOp`).
  if (await findUserByEmail(dbCtx, { email })) {
    rememberSsoCollision(ctx, { email, connectionId: connection.id });
    throw new AppError(409, 'sso_email_exists', 'warn', { meta: { strategy: federation.key } });
  }

  if (!connection.jitProvisioning && !(await hasPendingInvitation(dbCtx, { email }))) {
    throw new AppError(403, 'sign_up_restricted', 'info', { meta: { strategy: federation.key } });
  }

  const organization = await findOrganizationByTenant(dbCtx, { tenantId: connection.tenantId });

  const created = await baseDb.transaction(async (tx) => {
    const txCtx = { var: { db: tx } };
    const user = await createAccount(txCtx, { newUser: newUserFromProfile({ ...profile, email }), via: federation.key });

    await insertIdentity(txCtx, {
      values: { userId: user.id, kind: 'sso', issuer: federation.key, subject, email, connectionId: connection.id, data: snapshot },
      verified: true,
    });

    if (
      connection.jitProvisioning &&
      organization &&
      !(await findPendingOrganizationInactiveMembership(txCtx, { email, organizationId: organization.id }))
    ) {
      await insertSsoMembership(txCtx, { userId: user.id, organization, federation, connection, claims });
    }

    return user;
  });

  log.info('User provisioned through SSO', { userId: created.id, strategy: federation.key, connectionId: connection.id });

  const user = await findUserById(dbCtx, { id: created.id });
  if (!user) throw new AppError(404, 'not_found', 'error', { entityType: 'user' });
  return user;
};
