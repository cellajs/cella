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
  type ProviderGrant,
} from '#/modules/auth/oauth/helpers/providers';
import { type TransformedUser, transformGithubUserData, transformSocialUserData } from '#/modules/auth/oauth/helpers/transform-user-data';
import type { OAuthCallbackContext, OAuthStartContext } from '#/modules/auth/oauth/oauth-schema';
import { handleOAuthCallback } from '#/modules/auth/oauth/operations/handle-oauth-callback';
import { handleOAuthInitiation } from '#/modules/auth/oauth/operations/handle-oauth-initiation';

interface OAuthProviderEntry {
  client: typeof githubAuth;
  scopes: string[];
  /** The provider's profile from what the code exchange returned. */
  fetchUser: (grant: ProviderGrant) => Promise<TransformedUser>;
}

/** An OIDC provider's profile: the claims its client verified. */
const verifiedProfile = async ({ claims }: ProviderGrant) => transformSocialUserData(claims as GoogleUserProps | MicrosoftUserProps);

// `openid` is required for Google and Microsoft so the token endpoint returns an id_token, which carries the nonce validated on callback.
const oauthProviders = {
  github: {
    client: githubAuth,
    scopes: ['user:email'],
    fetchUser: async ({ accessToken }) => {
      const init = { headers: { Authorization: `Bearer ${accessToken}` }, signal: providerDeadline() };
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
    fetchUser: verifiedProfile,
  },
  microsoft: {
    client: microsoftAuth,
    scopes: ['openid', 'profile', 'email'],
    fetchUser: verifiedProfile,
  },
} satisfies Record<BaseOAuthProviders, OAuthProviderEntry>;

/**
 * Sends the browser to the provider with a fresh `state` and PKCE verifier, plus a nonce for an OIDC provider.
 * @throws AppError 503 `oauth_not_configured` when the environment has no client id and secret for the provider.
 */
export const startOAuth = async (ctx: OAuthStartContext, provider: BaseOAuthProviders) => {
  const { client, scopes } = oauthProviders[provider];
  if (!client.configured) throw new AppError(503, 'oauth_not_configured', 'warn', { meta: { strategy: provider } });
  const state = generateRandomState();
  const flow = { codeVerifier: generateRandomCodeVerifier(), ...(client.oidc && { nonce: generateRandomNonce() }) };
  const url = await client.createAuthorizationURL(state, scopes, flow);

  return handleOAuthInitiation(ctx, { provider, url, state, ...flow });
};

/**
 * Resumes the round trip `state` names: exchanges the code with the stored verifier (and nonce), reads the provider's
 * profile and hands it to the flow the state cookie holds.
 * @throws AppError 400 `oauth_failed` when the provider answered an error, 401 `invalid_state` without a matching state
 *   cookie, 401 `invalid_credentials` when the provider refuses the code, 401 `oauth_failed` when the exchange or the
 *   profile read fails otherwise, and what the flow throws.
 */
export const finishOAuth = async (ctx: OAuthCallbackContext, provider: BaseOAuthProviders) => {
  const { code, state, iss, error } = ctx.req.valid('query');
  const { client, fetchUser } = oauthProviders[provider];
  // The route's `xEnabledBy` switch refuses a provider this app has off.
  const strategy = provider as EnabledOAuthProvider;

  const cookiePayload = readOAuthCookie(ctx, state);

  if (error || !code) throw new AppError(400, 'oauth_failed', 'error', { meta: { strategy } });

  // The cookie `state` names is the CSRF check. It must come from this provider's start, with the verifier that start
  // stored: the verifier binds the code to this browser.
  if (!cookiePayload || cookiePayload.provider !== provider || !cookiePayload.codeVerifier) {
    throw new AppError(401, 'invalid_state', 'error', { meta: { strategy } });
  }

  try {
    // For an OIDC provider, id_token claims, `nonce` binding, signature and userinfo are validated inside the provider client.
    const { codeVerifier, nonce } = cookiePayload;
    const grant = await client.validateAuthorizationCode({ code, state, iss }, { codeVerifier, nonce });
    const providerUser = await fetchUser(grant);

    return await handleOAuthCallback(ctx, cookiePayload, providerUser, strategy);
  } catch (error) {
    if (error instanceof AppError) throw error;

    const type = error instanceof OAuthCodeExchangeError ? 'invalid_credentials' : 'oauth_failed';
    throw new AppError(401, type, 'error', { meta: { strategy }, ...(error instanceof Error ? { originalError: error } : {}) });
  }
};
