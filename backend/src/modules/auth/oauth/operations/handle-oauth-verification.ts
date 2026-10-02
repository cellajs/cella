import type { Context } from 'hono';
import { appConfig } from 'shared';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { findIdentityById } from '#/modules/auth/oauth/identities-queries';
import type { TokenRecord } from '#/modules/auth/tokens/tokens-queries';

/** The identity is read on the base pool, whatever the route's context holds. */
const dbCtx = { var: { db: baseDb } };

/** The provider the verification returns to: the signing-up provider account's, or the identity's. */
const verificationIssuer = async (token: TokenRecord) => {
  if (token.pendingSignUp) return token.pendingSignUp.issuer;
  if (!token.userId || !token.identityId) throw new AppError(500, 'server_error', 'error');

  const identity = await findIdentityById(dbCtx, { id: token.identityId });
  if (!identity) throw new AppError(400, 'invalid_request', 'warn');
  return identity.issuer;
};

/** Opens a redeemed verification link: back to the provider, to sign in again with the account under verification. */
export const handleOAuthVerification = async (ctx: Context<Env>, token: TokenRecord) => {
  const verificationURL = new URL(`${appConfig.backendAuthUrl}/${await verificationIssuer(token)}`);

  verificationURL.searchParams.set('tokenId', token.id);
  verificationURL.searchParams.set('type', 'verify');

  // The post-auth redirect stays on the token row; the verify initiation reads it from there.
  return ctx.redirect(verificationURL, 302);
};
