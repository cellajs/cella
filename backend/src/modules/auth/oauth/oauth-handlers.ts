import { OpenAPIHono } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { generateRandomCodeVerifier, generateRandomNonce, generateRandomState } from 'oauth4webapi';
import type { EnabledOAuthProvider } from 'shared';
import type { BaseOAuthProviders } from 'shared/config-builder/types';
import type z from 'zod';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { handleOAuthCallback } from '#/modules/auth/oauth/helpers/callback';
import { handleOAuthInitiation, readOAuthCookie } from '#/modules/auth/oauth/helpers/initiation';
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
import { authOAuthRoutes } from '#/modules/auth/oauth/oauth-routes';
import type { oauthCallbackQuerySchema, oauthQuerySchema } from '#/modules/auth/oauth/oauth-schema';
import { issueCookieToken } from '#/modules/auth/tokens/token-lifecycle';
import { defaultHook } from '#/utils/default-hook';

interface OAuthProviderEntry {
  client: typeof githubAuth;
  scopes: string[];
  /** Round trips carry a PKCE verifier and an OIDC nonce; the callback refuses a state stored without a verifier. */
  pkce: boolean;
  /** The provider's profile, read with the access token the code exchange returned. */
  fetchUser: (headers: Record<string, string>) => Promise<TransformedUser>;
}

/** An OIDC provider's profile from its userinfo endpoint. */
const readUserinfo = (url: string) => async (headers: Record<string, string>) => {
  const response = await fetch(url, { headers });
  return transformSocialUserData((await response.json()) as GoogleUserProps | MicrosoftUserProps);
};

// `openid` is required for Google and Microsoft so the token endpoint returns an id_token, which carries the nonce validated on callback.
const oauthProviders = {
  github: {
    client: githubAuth,
    scopes: ['user:email'],
    pkce: false,
    fetchUser: async (headers) => {
      const [userResponse, emailsResponse] = await Promise.all([
        fetch('https://api.github.com/user', { headers }),
        fetch('https://api.github.com/user/emails', { headers }),
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
const startOAuth = async (ctx: Context<Env, string, { out: { query: z.infer<typeof oauthQuerySchema> } }>, provider: BaseOAuthProviders) => {
  const { client, scopes, pkce } = oauthProviders[provider];
  const state = generateRandomState();
  const flow = pkce ? { codeVerifier: generateRandomCodeVerifier(), nonce: generateRandomNonce() } : undefined;
  const url = await client.createAuthorizationURL(state, scopes, flow);

  return await handleOAuthInitiation(ctx, provider, url, state, flow?.codeVerifier, flow?.nonce);
};

/**
 * Resumes the round trip `state` names: exchanges the code (with the stored verifier and nonce for a `pkce` provider),
 * reads the provider's profile and hands it to the flow the state cookie holds.
 */
const finishOAuth = async (ctx: Context<Env, string, { out: { query: z.infer<typeof oauthCallbackQuerySchema> } }>, provider: BaseOAuthProviders) => {
  const { code, state, error } = ctx.req.valid('query');
  const { client, pkce, fetchUser } = oauthProviders[provider];
  const strategy = provider as EnabledOAuthProvider;

  // Read before the provider's answer is judged: a connect's refusals from here on go back to the account page.
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

    const providerUser = await fetchUser({ Authorization: `Bearer ${accessToken}` });

    return await handleOAuthCallback(ctx, cookiePayload, providerUser, strategy);
  } catch (error) {
    if (error instanceof AppError) throw error;

    const type = error instanceof OAuthCodeExchangeError ? 'invalid_credentials' : 'oauth_failed';
    throw new AppError(401, type, 'error', { meta: { strategy }, ...(error instanceof Error ? { originalError: error } : {}) });
  }
};

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(authOAuthRoutes.startOAuthConnect, async (ctx) => {
  const { user, session } = ctx.var;

  // The provider's callback is a navigation from another site: this Lax cookie's token is what names the account. It
  // serves only while the session that asked lives, so a sign-out (here or elsewhere) ends a connect left half-way.
  await issueCookieToken(ctx, { type: 'oauth-connect', userId: user.id, email: user.email, createdBy: user.id, sessionId: session.id });

  return ctx.body(null, 204);
});

app.openapi(authOAuthRoutes.github, (ctx) => startOAuth(ctx, 'github'));
app.openapi(authOAuthRoutes.google, (ctx) => startOAuth(ctx, 'google'));
app.openapi(authOAuthRoutes.microsoft, (ctx) => startOAuth(ctx, 'microsoft'));

app.openapi(authOAuthRoutes.githubCallback, (ctx) => finishOAuth(ctx, 'github'));
app.openapi(authOAuthRoutes.googleCallback, (ctx) => finishOAuth(ctx, 'google'));
app.openapi(authOAuthRoutes.microsoftCallback, (ctx) => finishOAuth(ctx, 'microsoft'));

export const authOAuthHandlers = app;
