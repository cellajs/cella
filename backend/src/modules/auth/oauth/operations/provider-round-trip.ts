import { generateRandomCodeVerifier, generateRandomNonce, generateRandomState } from 'oauth4webapi';
import type { EnabledOAuthProvider } from 'shared';
import type { BaseOAuthProviders } from 'shared/config-builder/types';
import { AppError } from '#/core/error';
import { providerDeadline } from '#/modules/auth/oauth/helpers/code-flow';
import { readOAuthCookie } from '#/modules/auth/oauth/helpers/oauth-cookie';
import {
  type GithubUserEmailProps,
  type GithubUserProps,
  type GoogleUserProps,
  githubAuth,
  googleAuth,
  type MicrosoftUserProps,
  microsoftAuth,
  OAuthCodeExchangeError,
} from '#/modules/auth/oauth/helpers/providers';
import { type TransformedUser, transformGithubUserData, transformSocialUserData } from '#/modules/auth/oauth/helpers/transform-user-data';
import type { OAuthCallbackContext, OAuthStartContext } from '#/modules/auth/oauth/oauth-schema';
import { handleOAuthCallback } from '#/modules/auth/oauth/operations/handle-oauth-callback';
import { handleOAuthInitiation } from '#/modules/auth/oauth/operations/handle-oauth-initiation';

interface OAuthProviderEntry {
  client: typeof githubAuth;
  scopes: string[];
  /** Round trips carry a PKCE verifier and an OIDC nonce; the callback refuses a state stored without a verifier. */
  pkce: boolean;
  /** The provider's profile, read with the access token the code exchange returned; `init` carries it and the deadline. */
  fetchUser: (init: RequestInit) => Promise<TransformedUser>;
}

/** An OIDC provider's profile from its userinfo endpoint. */
const readUserinfo = (url: string) => async (init: RequestInit) => {
  const response = await fetch(url, init);
  return transformSocialUserData((await response.json()) as GoogleUserProps | MicrosoftUserProps);
};

// `openid` is required for Google and Microsoft so the token endpoint returns an id_token, which carries the nonce validated on callback.
const oauthProviders = {
  github: {
    client: githubAuth,
    scopes: ['user:email'],
    pkce: false,
    fetchUser: async (init) => {
      const [userResponse, emailsResponse] = await Promise.all([
        fetch('https://api.github.com/user', init),
        fetch('https://api.github.com/user/emails', init),
      ]);
      const user = (await userResponse.json()) as GithubUserProps;
      const emails = (await emailsResponse.json()) as GithubUserEmailProps[];
      return transformGithubUserData(user, emails);
    },
  },
  google: {
    client: googleAuth,
    scopes: ['openid', 'profile', 'email'],
    pkce: true,
    fetchUser: readUserinfo('https://openidconnect.googleapis.com/v1/userinfo'),
  },
  microsoft: {
    client: microsoftAuth,
    scopes: ['openid', 'profile', 'email'],
    pkce: true,
    fetchUser: readUserinfo('https://graph.microsoft.com/oidc/userinfo'),
  },
} satisfies Record<BaseOAuthProviders, OAuthProviderEntry>;

/** Sends the browser to the provider with a fresh `state`, plus a PKCE verifier and a nonce for a `pkce` provider. */
export const startOAuth = async (ctx: OAuthStartContext, provider: BaseOAuthProviders) => {
  const { client, scopes, pkce } = oauthProviders[provider];
  const state = generateRandomState();
  const flow = pkce ? { codeVerifier: generateRandomCodeVerifier(), nonce: generateRandomNonce() } : undefined;
  const url = await client.createAuthorizationURL(state, scopes, flow);

  return handleOAuthInitiation(ctx, { provider, url, state, ...flow });
};

/**
 * Resumes the round trip `state` names: exchanges the code (with the stored verifier and nonce for a `pkce` provider),
 * reads the provider's profile and hands it to the flow the state cookie holds.
 * @throws AppError 400 `oauth_failed` when the provider answered an error, 401 `invalid_state` without a matching state
 *   cookie, 401 `invalid_credentials` when the provider refuses the code, 401 `oauth_failed` when the exchange or the
 *   profile read fails otherwise, and what the flow throws.
 */
export const finishOAuth = async (ctx: OAuthCallbackContext, provider: BaseOAuthProviders) => {
  const { code, state, error } = ctx.req.valid('query');
  const { client, pkce, fetchUser } = oauthProviders[provider];
  // The route's `xEnabledBy` switch refuses a provider this app has off.
  const strategy = provider as EnabledOAuthProvider;

  const cookiePayload = await readOAuthCookie(ctx, state);

  if (error || !code) throw new AppError(400, 'oauth_failed', 'error', { meta: { strategy } });

  // The cookie `state` names is the CSRF check. It must come from this provider's start, and a PKCE provider also
  // needs the verifier that start stored.
  if (!cookiePayload || cookiePayload.provider !== provider || (pkce && !cookiePayload.codeVerifier)) {
    throw new AppError(401, 'invalid_state', 'error', { meta: { strategy } });
  }

  try {
    // For an OIDC provider, id_token claims, `nonce` binding, and signature are validated inside the provider client.
    const { accessToken } = await client.validateAuthorizationCode(
      code,
      state,
      pkce ? { codeVerifier: cookiePayload.codeVerifier, nonce: cookiePayload.nonce } : undefined,
    );

    const providerUser = await fetchUser({ headers: { Authorization: `Bearer ${accessToken}` }, signal: providerDeadline() });

    return await handleOAuthCallback(ctx, cookiePayload, providerUser, strategy);
  } catch (error) {
    if (error instanceof AppError) throw error;

    const type = error instanceof OAuthCodeExchangeError ? 'invalid_credentials' : 'oauth_failed';
    throw new AppError(401, type, 'error', { meta: { strategy }, ...(error instanceof Error ? { originalError: error } : {}) });
  }
};
