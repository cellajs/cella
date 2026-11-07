import { appConfig } from 'shared';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { findIdentityById } from '#/modules/auth/oauth/identities-queries';
import type { TokenRecord } from '#/modules/auth/tokens/tokens-queries';

const dbCtx = { var: { db: baseDb } };

/** The provider the verification returns to: the signing-up provider account's, or the identity's. */
const verificationIssuer = async (token: TokenRecord) => {
  if (token.pendingSignUp) return token.pendingSignUp.issuer;
  if (!token.userId || !token.identityId) throw new AppError(500, 'server_error', 'error');

  const identity = await findIdentityById(dbCtx, { id: token.identityId });
  if (!identity) throw new AppError(400, 'invalid_request', 'warn');
  return identity.issuer;
};

/** Where a redeemed verification link goes: back to the provider, to sign in again with the account under verification. */
export const oauthVerificationUrl = async (token: TokenRecord) => {
  const verificationURL = new URL(`${appConfig.backendAuthUrl}/${await verificationIssuer(token)}`);
  verificationURL.searchParams.set('kind', 'verify');

  // The post-auth redirect stays on the token row; the verify initiation reads it from there.
  return verificationURL.toString();
};
