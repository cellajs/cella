import { OpenAPIHono } from '@hono/zod-openapi';
import { generateCodeVerifier, generateState, OAuth2RequestError } from 'arctic';
import { appConfig, type EnabledOAuthProvider } from 'shared';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { getAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { handleOAuthCallback } from '#/modules/auth/oauth/helpers/callback';
import { handleOAuthInitiation, parseOAuthCookie } from '#/modules/auth/oauth/helpers/initiation';
import {
  type GithubUserEmailProps,
  type GithubUserProps,
  type GoogleUserProps,
  githubAuth,
  googleAuth,
  type MicrosoftUserProps,
  microsoftAuth,
} from '#/modules/auth/oauth/helpers/providers';
import { transformGithubUserData, transformSocialUserData } from '#/modules/auth/oauth/helpers/transform-user-data';
import { validateOidcNonce } from '#/modules/auth/oauth/helpers/validate-oidc-nonce';
import authOAuthRoutes from '#/modules/auth/oauth/oauth-routes';
import { defaultHook } from '#/utils/default-hook';

// Scopes for OAuth providers. `openid` is required for Google/Microsoft so the token
// endpoint returns an id_token, which carries the nonce we validate on callback.
const githubScopes = ['user:email'];
const googleScopes = ['openid', 'profile', 'email'];
const microsoftScopes = ['openid', 'profile', 'email'];

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(authOAuthRoutes.github, async (ctx) => {
  // Check if Github OAuth is enabled
  const strategy = 'github' as EnabledOAuthProvider;

  if (!appConfig.enabledAuthStrategies.includes('oauth') || !appConfig.enabledOAuthProviders.includes(strategy)) {
    throw new AppError(400, 'unsupported_oauth', 'error', {
      willRedirect: appConfig.mode !== 'test',
      meta: { errorPagePath: '/auth/error', strategy },
    });
  }

  // Generate a `state` to prevent CSRF, and build URL with scope.
  const state = generateState();
  const url = githubAuth.createAuthorizationURL(state, githubScopes);

  // Start the OAuth session & flow (Persist `state`)
  return await handleOAuthInitiation(ctx, 'github', url, state);
});

app.openapi(authOAuthRoutes.google, async (ctx) => {
  // Check if Google OAuth is enabled
  const strategy = 'google' as EnabledOAuthProvider;
  if (!appConfig.enabledAuthStrategies.includes('oauth') || !appConfig.enabledOAuthProviders.includes(strategy)) {
    throw new AppError(400, 'unsupported_oauth', 'error', {
      willRedirect: appConfig.mode !== 'test',
      meta: { errorPagePath: '/auth/error', strategy },
    });
  }

  // Generate a `state`, PKCE, OIDC `nonce`, and scoped URL.
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const nonce = generateState();
  const url = googleAuth.createAuthorizationURL(state, codeVerifier, googleScopes);
  url.searchParams.set('nonce', nonce);

  // Start the OAuth session & flow (Persist `state`, `codeVerifier` and `nonce`)
  return await handleOAuthInitiation(ctx, 'google', url, state, codeVerifier, nonce);
});

app.openapi(authOAuthRoutes.microsoft, async (ctx) => {
  // Check if Microsoft OAuth is enabled
  const strategy = 'microsoft' as EnabledOAuthProvider;
  if (!appConfig.enabledAuthStrategies.includes('oauth') || !appConfig.enabledOAuthProviders.includes(strategy)) {
    throw new AppError(400, 'unsupported_oauth', 'error', {
      willRedirect: appConfig.mode !== 'test',
      meta: { errorPagePath: '/auth/error', strategy },
    });
  }

  // Generate a `state`, PKCE, OIDC `nonce`, and scoped URL.
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const nonce = generateState();
  const url = microsoftAuth.createAuthorizationURL(state, codeVerifier, microsoftScopes);
  url.searchParams.set('nonce', nonce);

  // Start the OAuth session & flow (Persist `state`, `codeVerifier` and `nonce`)
  return await handleOAuthInitiation(ctx, 'microsoft', url, state, codeVerifier, nonce);
});

app.openapi(authOAuthRoutes.githubCallback, async (ctx) => {
  const { code, state, error } = ctx.req.valid('query');

  const strategy = 'github' as EnabledOAuthProvider;

  // When something went wrong during Github OAuth, fail early.
  if (error || !code) {
    throw new AppError(400, 'oauth_failed', 'error', {
      willRedirect: appConfig.mode !== 'test',
      meta: { errorPagePath: '/auth/error', strategy },
    });
  }

  // Verify cookie by `state` (CSRF protection)
  const oauthCookie = await getAuthCookie(ctx, `oauth-state-${state}`);
  const cookiePayload = parseOAuthCookie(oauthCookie);

  if (!state || !cookiePayload) {
    throw new AppError(401, 'invalid_state', 'error', {
      willRedirect: appConfig.mode !== 'test',
      meta: { errorPagePath: '/auth/error', strategy },
    });
  }

  try {
    // Exchange authorization code for access token and fetch Github user info
    const githubValidation = await githubAuth.validateAuthorizationCode(code);
    const accessToken = githubValidation.accessToken();

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

    // Handle known OAuth validation errors (e.g. bad token, revoked code)
    const type = error instanceof OAuth2RequestError ? 'invalid_credentials' : 'oauth_failed';
    throw new AppError(401, type, 'error', {
      willRedirect: appConfig.mode !== 'test',
      meta: { errorPagePath: '/auth/error', strategy },
      ...(error instanceof Error ? { originalError: error } : {}),
    });
  }
});

app.openapi(authOAuthRoutes.googleCallback, async (ctx) => {
  const { state, code } = ctx.req.valid('query');
  const strategy = 'google' as EnabledOAuthProvider;

  // Verify cookie by `state` (CSRF protection) & PKCE validation
  const oauthCookie = await getAuthCookie(ctx, `oauth-state-${state}`);
  const cookiePayload = parseOAuthCookie(oauthCookie);

  if (!code || !cookiePayload?.codeVerifier) {
    throw new AppError(401, 'invalid_state', 'error', {
      willRedirect: appConfig.mode !== 'test',
      meta: { errorPagePath: '/auth/error', strategy },
    });
  }

  try {
    // Exchange authorization code for access token and fetch Google user info
    const googleValidation = await googleAuth.validateAuthorizationCode(code, cookiePayload.codeVerifier);

    // Defense-in-depth: bind the callback to initiation via the id_token nonce
    validateOidcNonce(googleValidation, cookiePayload.nonce, strategy);

    const accessToken = googleValidation.accessToken();

    const headers = { Authorization: `Bearer ${accessToken}` };
    const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers });
    const googleUser = (await response.json()) as GoogleUserProps;
    const providerUser = transformSocialUserData(googleUser);

    return await handleOAuthCallback(ctx, cookiePayload, providerUser, strategy);
  } catch (error) {
    if (error instanceof AppError) throw error;

    // Handle known OAuth validation errors (e.g. bad token, revoked code)
    const type = error instanceof OAuth2RequestError ? 'invalid_credentials' : 'oauth_failed';
    throw new AppError(401, type, 'error', {
      willRedirect: appConfig.mode !== 'test',
      meta: { errorPagePath: '/auth/error', strategy },
      ...(error instanceof Error ? { originalError: error } : {}),
    });
  }
});

app.openapi(authOAuthRoutes.microsoftCallback, async (ctx) => {
  const { state, code } = ctx.req.valid('query');
  const strategy = 'microsoft' as EnabledOAuthProvider;

  // Verify cookie by `state` (CSRF protection) & PKCE validation
  const oauthCookie = await getAuthCookie(ctx, `oauth-state-${state}`);
  const cookiePayload = parseOAuthCookie(oauthCookie);

  if (!code || !cookiePayload?.codeVerifier) {
    throw new AppError(401, 'invalid_state', 'error', {
      willRedirect: appConfig.mode !== 'test',
      meta: { errorPagePath: '/auth/error', strategy },
    });
  }

  try {
    // Exchange authorization code for access token and fetch Microsoft user info
    const microsoftValidation = await microsoftAuth.validateAuthorizationCode(code, cookiePayload.codeVerifier);

    // Defense-in-depth: bind the callback to initiation via the id_token nonce
    validateOidcNonce(microsoftValidation, cookiePayload.nonce, strategy);

    const accessToken = microsoftValidation.accessToken();

    const headers = { Authorization: `Bearer ${accessToken}` };
    const response = await fetch('https://graph.microsoft.com/oidc/userinfo', { headers });
    const microsoftUser = (await response.json()) as MicrosoftUserProps;
    const providerUser = transformSocialUserData(microsoftUser);

    return await handleOAuthCallback(ctx, cookiePayload, providerUser, strategy);
  } catch (error) {
    if (error instanceof AppError) throw error;

    // Handle known OAuth validation errors (e.g. bad token, revoked code)
    const type = error instanceof OAuth2RequestError ? 'invalid_credentials' : 'oauth_failed';
    throw new AppError(401, type, 'error', {
      willRedirect: appConfig.mode !== 'test',
      meta: { errorPagePath: '/auth/error', strategy },
      ...(error instanceof Error ? { originalError: error } : {}),
    });
  }
});

export const authOAuthHandlers = app;
