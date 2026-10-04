import type { Context } from 'hono';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { finishSignIn } from '#/modules/auth/general/helpers/finish-sign-in';
import { findIdentityBySubject, updateIdentity } from '#/modules/auth/oauth/identities-queries';
import type { OAuthCookiePayload } from '#/modules/auth/oauth/oauth-schema';
import type { SsoClaims } from '#/modules/auth/sso/helpers/federation-client';
import type { Federation } from '#/modules/auth/sso/helpers/federations';
import { assertedInstitution, snapshotOf, transformSsoClaims } from '#/modules/auth/sso/helpers/transform-sso-claims';
import { connectSsoIdentity } from '#/modules/auth/sso/operations/connect-sso-identity';
import { provisionSsoUser } from '#/modules/auth/sso/operations/provision-sso-user';
import { findActiveSsoConnectionByClaim, findConnectionById } from '#/modules/connections/connections-queries';
import type { EmailProof } from '#/modules/user/emails-db';
import { addProvenEmail } from '#/modules/user/operations/email-proof';
import { findUserById } from '#/modules/user/user-queries';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';

const dbCtx = { var: { db: baseDb } };

export interface SsoSignIn {
  federation: Federation;
  claims: SsoClaims;
  payload: OAuthCookiePayload;
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
  const extras = { connectionId: connection.id };

  if (type === 'connect') {
    const user = await connectSsoIdentity(ctx, facts);
    return finishSignIn(ctx, user, federation.key, redirectAfter, extras);
  }

  if (identity) {
    const user = await findUserById(dbCtx, { id: identity.userId });
    if (!user) throw new AppError(404, 'not_found', 'error', { entityType: 'user' });

    await updateIdentity(dbCtx, {
      id: identity.id,
      values: { lastUsedAt: getIsoDate(), email: profile.email ?? identity.email, data: snapshot, connectionId: connection.id },
    });
    if (federation.addressAuthority && profile.email && profile.email !== user.email)
      await proveAssertedAddress(user.id, profile.email, federation.key);

    return finishSignIn(ctx, user, federation.key, redirectAfter, extras);
  }

  const user = await provisionSsoUser(ctx, facts);
  return finishSignIn(ctx, user, federation.key, redirectAfter, extras);
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
