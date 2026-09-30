import { OpenAPIHono } from '@hono/zod-openapi';
import { generateRandomCodeVerifier, generateRandomNonce, generateRandomState } from 'oauth4webapi';
import type { EnabledOAuthProvider } from 'shared';
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
import { transformGithubUserData, transformSocialUserData } from '#/modules/auth/oauth/helpers/transform-user-data';
import { authOAuthRoutes } from '#/modules/auth/oauth/oauth-routes';
import { issueCookieToken } from '#/modules/auth/tokens/token-lifecycle';
import { defaultHook } from '#/utils/default-hook';

// `openid` is required for Google and Microsoft so the token endpoint returns an id_token, which carries the nonce validated on callback.
const githubScopes = ['user:email'];
const googleScopes = ['openid', 'profile', 'email'];
const microsoftScopes = ['openid', 'profile', 'email'];

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(authOAuthRoutes.startOAuthConnect, async (ctx) => {
  const { user, session } = ctx.var;

  // The provider's callback is a navigation from another site: this Lax cookie's token is what names the account. It
  // serves only while the session that asked lives, so a sign-out (here or elsewhere) ends a connect left half-way.
  await issueCookieToken(ctx, {
    type: 'oauth-connect',
    userId: user.id,
    email: user.email,
    createdBy: user.id,
    sessionId: session.id,
  });

  return ctx.body(null, 204);
});

app.openapi(authOAuthRoutes.github, async (ctx) => {
  // Generate a `state` to prevent CSRF, and build URL with scope.
  const state = generateRandomState();
  const url = await githubAuth.createAuthorizationURL(state, githubScopes);

  return await handleOAuthInitiation(ctx, 'github', url, state);
});

app.openapi(authOAuthRoutes.google, async (ctx) => {
  const state = generateRandomState();
  const codeVerifier = generateRandomCodeVerifier();
  const nonce = generateRandomNonce();
  const url = await googleAuth.createAuthorizationURL(state, googleScopes, { codeVerifier, nonce });

  return await handleOAuthInitiation(ctx, 'google', url, state, codeVerifier, nonce);
});

app.openapi(authOAuthRoutes.microsoft, async (ctx) => {
  const state = generateRandomState();
  const codeVerifier = generateRandomCodeVerifier();
  const nonce = generateRandomNonce();
  const url = await microsoftAuth.createAuthorizationURL(state, microsoftScopes, { codeVerifier, nonce });

  return await handleOAuthInitiation(ctx, 'microsoft', url, state, codeVerifier, nonce);
});

app.openapi(authOAuthRoutes.githubCallback, async (ctx) => {
  const { code, state, error } = ctx.req.valid('query');

  const strategy = 'github' as EnabledOAuthProvider;

  // Read before the provider's answer is judged: a connect's refusals from here on go back to the account page.
  const cookiePayload = await readOAuthCookie(ctx, state);

  if (error || !code) throw new AppError(400, 'oauth_failed', 'error', { meta: { strategy } });

  // Verify cookie by `state` (CSRF protection)
  if (!cookiePayload) throw new AppError(401, 'invalid_state', 'error', { meta: { strategy } });

  try {
    const { accessToken } = await githubAuth.validateAuthorizationCode(code, state);

    const headers = { Authorization: `Bearer ${accessToken}` };
    const [githubUserResponse, githubUserEmailsResponse] = await Promise.all([
      fetch('https://api.github.com/user', { headers }),
      fetch('https://api.github.com/user/emails', { headers }),
    ]);

    const githubUser = (await githubUserResponse.json()) as GithubUserProps;
    const githubUserEmails = (await githubUserEmailsResponse.json()) as GithubUserEmailProps[];
    const providerUser = transformGithubUserData(githubUser, githubUserEmails);

    return await handleOAuthCallback(ctx, cookiePayload, providerUser, strategy);
  } catch (error) {
    if (error instanceof AppError) throw error;

    const type = error instanceof OAuthCodeExchangeError ? 'invalid_credentials' : 'oauth_failed';
    throw new AppError(401, type, 'error', {
      meta: { strategy },
      ...(error instanceof Error ? { originalError: error } : {}),
    });
  }
});

app.openapi(authOAuthRoutes.googleCallback, async (ctx) => {
  const { state, code } = ctx.req.valid('query');
  const strategy = 'google' as EnabledOAuthProvider;

  // Verify cookie by `state` (CSRF protection) & PKCE validation
  const cookiePayload = await readOAuthCookie(ctx, state);

  if (!code || !cookiePayload?.codeVerifier) throw new AppError(401, 'invalid_state', 'error', { meta: { strategy } });

  try {
    // id_token claims, `nonce` binding, and signature are validated inside the provider client.
    const { accessToken } = await googleAuth.validateAuthorizationCode(code, state, {
      codeVerifier: cookiePayload.codeVerifier,
      nonce: cookiePayload.nonce,
    });

    const headers = { Authorization: `Bearer ${accessToken}` };
    const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers });
    const googleUser = (await response.json()) as GoogleUserProps;
    const providerUser = transformSocialUserData(googleUser);

    return await handleOAuthCallback(ctx, cookiePayload, providerUser, strategy);
  } catch (error) {
    if (error instanceof AppError) throw error;

    const type = error instanceof OAuthCodeExchangeError ? 'invalid_credentials' : 'oauth_failed';
    throw new AppError(401, type, 'error', {
      meta: { strategy },
      ...(error instanceof Error ? { originalError: error } : {}),
    });
  }
});

app.openapi(authOAuthRoutes.microsoftCallback, async (ctx) => {
  const { state, code } = ctx.req.valid('query');
  const strategy = 'microsoft' as EnabledOAuthProvider;

  // Verify cookie by `state` (CSRF protection) & PKCE validation
  const cookiePayload = await readOAuthCookie(ctx, state);

  if (!code || !cookiePayload?.codeVerifier) throw new AppError(401, 'invalid_state', 'error', { meta: { strategy } });

  try {
    // id_token claims, `nonce` binding, and signature are validated inside the provider client.
    const { accessToken } = await microsoftAuth.validateAuthorizationCode(code, state, {
      codeVerifier: cookiePayload.codeVerifier,
      nonce: cookiePayload.nonce,
    });

    const headers = { Authorization: `Bearer ${accessToken}` };
    const response = await fetch('https://graph.microsoft.com/oidc/userinfo', { headers });
    const microsoftUser = (await response.json()) as MicrosoftUserProps;
    const providerUser = transformSocialUserData(microsoftUser);

    return await handleOAuthCallback(ctx, cookiePayload, providerUser, strategy);
  } catch (error) {
    if (error instanceof AppError) throw error;

    const type = error instanceof OAuthCodeExchangeError ? 'invalid_credentials' : 'oauth_failed';
    throw new AppError(401, type, 'error', {
      meta: { strategy },
      ...(error instanceof Error ? { originalError: error } : {}),
    });
  }
});

export const authOAuthHandlers = app;
