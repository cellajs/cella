import type { Context } from 'hono';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { finishSignIn } from '#/modules/auth/general/operations/finish-sign-in';
import type { IdentityModel } from '#/modules/auth/oauth/identities-db';
import { findIdentityBySubject } from '#/modules/auth/oauth/identities-queries';
import type { OAuthCookiePayload } from '#/modules/auth/oauth/oauth-schema';
import { provesAddress } from '#/modules/auth/sso/helpers/address-authority';
import type { SsoClaims } from '#/modules/auth/sso/helpers/federation-client';
import type { Federation } from '#/modules/auth/sso/helpers/federations';
import { assertedInstitution, type SsoProfile, snapshotOf, transformSsoClaims } from '#/modules/auth/sso/helpers/transform-sso-claims';
import { connectSsoIdentity, touchSsoIdentity } from '#/modules/auth/sso/operations/connect-sso-identity';
import { provisionSsoUser } from '#/modules/auth/sso/operations/provision-sso-user';
import type { ConnectionModel } from '#/modules/connections/connections-db';
import { findActiveSsoConnectionByClaim, findConnectionById } from '#/modules/connections/connections-queries';
import type { EmailProof } from '#/modules/user/emails-db';
import { addProvenEmail } from '#/modules/user/operations/email-proof';
import { findUserById } from '#/modules/user/user-queries';
import { log } from '#/utils/logger';

const dbCtx = { var: { db: baseDb } };

/** A sign-in the federation verified: its claims and the state cookie of its round trip. */
export interface SsoSignIn {
  federation: Federation;
  claims: SsoClaims;
  payload: OAuthCookiePayload;
}

/** One verified SSO sign-in, resolved against its connection: what the completion flows act on. */
export interface SsoSignInFacts {
  federation: Federation;
  connection: ConnectionModel;
  /** Every verified claim of the sign-in: what `roleFromClaims` reads. */
  claims: SsoClaims;
  profile: SsoProfile;
  /** The claims kept on the identity row. */
  snapshot: Record<string, unknown>;
  subject: string;
  /** The identity the subject already is, when the account signed in before. */
  identity: IdentityModel | undefined;
}

/**
 * Completes a verified SSO sign-in. The institution assertion comes first: the connection the round trip started from
 * (or, for a start without one, the connection whose domains hold the asserted value) must stand active and accept
 * the institution the claims assert. Then the identity signs in, is created with its account, or is connected to the
 * pinned user, and a session is set with the method and connection recorded.
 * @throws AppError 403 `sso_wrong_institution` when no active connection of the federation accepts the asserted
 *   institution, and what provisioning and connecting throw.
 */
export const completeSsoSignIn = async (ctx: Context<Env>, { federation, claims, payload }: SsoSignIn) => {
  const { type, redirectAfter, connectionId } = payload;

  const claimed = assertedInstitution(federation, claims);
  const connection = connectionId
    ? await findConnectionById(dbCtx, { id: connectionId })
    : claimed
      ? await findActiveSsoConnectionByClaim(dbCtx, { issuer: federation.key, claimValue: claimed })
      : undefined;

  if (
    connection?.kind !== 'sso' ||
    connection.issuer !== federation.key ||
    connection.status !== 'active' ||
    !claimed ||
    !connection.claimValues.includes(claimed)
  ) {
    throw new AppError(403, 'sso_wrong_institution', 'warn', { meta: { strategy: federation.key, institution: claimed ?? null } });
  }

  const profile = transformSsoClaims(claims);
  const snapshot = snapshotOf(federation, claims);
  const identity = await findIdentityBySubject(dbCtx, { kind: 'sso', issuer: federation.key, subject: claims.sub });
  const facts = { federation, connection, claims, profile, snapshot, subject: claims.sub, identity };
  // An institution that asserts MFA proves a second factor: the session starts stepped up by it.
  const assertedMfa = typeof claims.acr === 'string' && !!federation.mfaAcr?.includes(claims.acr);

  const user =
    type === 'connect'
      ? await connectSsoIdentity(ctx, facts)
      : identity
        ? await signInSsoIdentity(identity, facts)
        : await provisionSsoUser(ctx, facts);

  return finishSignIn(ctx, user, federation.key, redirectAfter, {
    connectionId: connection.id,
    ...(assertedMfa && { steppedUpVia: 'sso' as const }),
  });
};

/** The account of a returning identity: the use recorded, and a changed address added when the institution proves it. */
const signInSsoIdentity = async (identity: IdentityModel, { federation, connection, profile, snapshot }: SsoSignInFacts) => {
  const user = await findUserById(dbCtx, { id: identity.userId });
  if (!user) throw new AppError(404, 'not_found', 'error', { entityType: 'user' });

  await touchSsoIdentity(identity, { profile, snapshot, connection });
  if (profile.email && profile.email !== user.email && provesAddress(federation, connection, profile.email)) {
    await proveAssertedAddress(user.id, profile.email, federation.key);
  }
  return user;
};

/** A changed institutional address joins the account's ledger; one another account holds is logged, never a sign-in failure. */
const proveAssertedAddress = async (userId: string, email: string, via: EmailProof) => {
  try {
    await addProvenEmail(dbCtx, { userId, email, via });
  } catch (error) {
    if (error instanceof AppError && error.status === 409) {
      log.warn('Asserted address held by another account', { userId, strategy: via });
      return;
    }
    throw error;
  }
};
