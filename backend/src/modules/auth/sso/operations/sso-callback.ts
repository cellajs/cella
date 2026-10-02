import type { Context } from 'hono';
import type z from 'zod';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { readOAuthCookie } from '#/modules/auth/oauth/helpers/oauth-cookie';
import type { oauthCallbackQuerySchema } from '#/modules/auth/oauth/oauth-schema';
import { exchangeFederationCode } from '#/modules/auth/sso/helpers/federation-client';
import { getFederation, isFederationKey } from '#/modules/auth/sso/helpers/federations';
import { completeSsoSignIn } from '#/modules/auth/sso/operations/complete-sso-sign-in';

type CallbackContext = Context<Env, string, { out: { query: z.infer<typeof oauthCallbackQuerySchema> } }>;

/**
 * Resumes the round trip `state` names: the state cookie says which federation and connection it belongs to and holds
 * the verifier and nonce; the code is exchanged and verified, then the sign-in completes against the connection.
 * @throws AppError 400 `oauth_failed` when the federation answered an error, 401 `invalid_state` without a matching
 *   state cookie, and what the exchange and the completion throw.
 */
export const handleSsoCallback = async (ctx: CallbackContext) => {
  const { code, state, error } = ctx.req.valid('query');

  // Read before the federation's answer is judged: a connect's refusals from here on go back to the account page.
  const payload = await readOAuthCookie(ctx, state);

  if (error || !code) throw new AppError(400, 'oauth_failed', 'error', { meta: { strategy: 'sso', error: error ?? null } });
  if (!payload || !isFederationKey(payload.provider) || !payload.codeVerifier || !payload.nonce) {
    throw new AppError(401, 'invalid_state', 'error', { meta: { strategy: 'sso' } });
  }

  const federation = getFederation(payload.provider);
  const claims = await exchangeFederationCode(federation, { code, state, codeVerifier: payload.codeVerifier, nonce: payload.nonce });

  return completeSsoSignIn(ctx, { federation, claims, payload });
};
