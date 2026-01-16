import { OpenAPIHono } from '@hono/zod-openapi';
import { generateCodeVerifier, generateState, OAuth2RequestError } from 'arctic';
import { appConfig, type EnabledOAuthProvider } from 'config';
import { env } from '#/env';
import { type Env } from '#/lib/context';
import { AppError } from '#/lib/error';
import { getAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { handleOAuthCallback } from '#/modules/auth/oauth/helpers/callback';
import { handleOAuthInitiation, type OAuthCookiePayload } from '#/modules/auth/oauth/helpers/initiation';
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
import authOAuthRoutes from '#/modules/auth/oauth/oauth-routes';
import { defaultHook } from '#/utils/default-hook';

// Scopes for OAuth providers
const githubScopes = ['user:email'];
const googleScopes = ['profile', 'email'];
const microsoftScopes = ['profile', 'email'];

// When no microsoft tenant is configured, we use common with openid scope
if (!env.MICROSOFT_TENANT_ID) {
  microsoftScopes.push('openid');
}

const app = new OpenAPIHono<Env>({ defaultHook });

const authOAuthRouteHandlers = app

  /**
   * Initiates GitHub OAuth authentication flow
   */
  .openapi(authOAuthRoutes.github, async (ctx) => {
    // Check if Github OAuth is enabled
    const strategy = 'github' as EnabledOAuthProvider;

    if (!appConfig.enabledAuthStrategies.includes('oauth') || !appConfig.enabledOAuthProviders.includes(strategy)) {
      throw new AppError(400, 'unsupported_oauth', 'error', {
        willRedirect: true,
        meta: { errorPagePath: '/auth/error', strategy },
      });
    }

    // Generate a `state` to prevent CSRF, and build URL with scope.
    const state = generateState();
    const url = githubAuth.createAuthorizationURL(state, githubScopes);

    // Start the OAuth session & flow (Persist `state`)
    return await handleOAuthInitiation(ctx, 'github', url, state);
  })
  /**
   * Initiates Google OAuth authentication flow
   */
  .openapi(authOAuthRoutes.google, async (ctx) => {
    // Check if Google OAuth is enabled
    const strategy = 'google' as EnabledOAuthProvider;
    if (!appConfig.enabledAuthStrategies.includes('oauth') || !appConfig.enabledOAuthProviders.includes(strategy)) {
      throw new AppError(400, 'unsupported_oauth', 'error', {
        willRedirect: true,
        meta: { errorPagePath: '/auth/error', strategy },
      });
    }

    // Generate a `state`, PKCE, and scoped URL.
    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const url = googleAuth.createAuthorizationURL(state, codeVerifier, googleScopes);

    // Start the OAuth session & flow (Persist `state` and `codeVerifier`)
    return await handleOAuthInitiation(ctx, 'google', url, state, codeVerifier);
  })
  /**
   * Initiates Microsoft OAuth authentication flow
   */
  .openapi(authOAuthRoutes.microsoft, async (ctx) => {
    // Check if Microsoft OAuth is enabled
    const strategy = 'microsoft' as EnabledOAuthProvider;
    if (!appConfig.enabledAuthStrategies.includes('oauth') || !appConfig.enabledOAuthProviders.includes(strategy)) {
      throw new AppError(400, 'unsupported_oauth', 'error', {
        willRedirect: true,
        meta: { errorPagePath: '/auth/error', strategy },
      });
    }

    // Generate a `state`, PKCE, and scoped URL.
    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const url = microsoftAuth.createAuthorizationURL(state, codeVerifier, microsoftScopes);

    // Start the OAuth session & flow (Persist `state` and `codeVerifier`)
    return await handleOAuthInitiation(ctx, 'microsoft', url, state, codeVerifier);
  })
  /**
   * GitHub callback
   */
  .openapi(authOAuthRoutes.githubCallback, async (ctx) => {
    const { code, state, error } = ctx.req.valid('query');

    /*
     * Handle custom redirect flow (e.g., for external apps or tools):
     * If `state` includes a `redirectUrl`, redirect there with OAuth params.
     * Falls back silently if `state` is not a JSON-encoded object.
     */
    try {
      const parsedState = JSON.parse(atob(state));
      if (parsedState.redirectUrl)
        return ctx.redirect(`${parsedState.redirectUrl}?code=${code}&state=${state}&error=${error}`, 302);
    } catch (_) {
      // Ignore parsing errors; continue with standard OAuth handling
    }
    const strategy = 'github' as EnabledOAuthProvider;

    // When something went wrong during Github OAuth, fail early.
    if (error || !code) {
      throw new AppError(400, 'oauth_failed', 'error', {
        willRedirect: true,
        meta: { errorPagePath: '/auth/error', strategy },
      });
    }

    // Verify cookie by `state` (CSRF protection)
    const oauthCookie = await getAuthCookie(ctx, `oauth-state-${state}`);
    const cookiePayload: OAuthCookiePayload | null = oauthCookie ? JSON.parse(oauthCookie) : null;

    if (!state || !cookiePayload) {
      throw new AppError(401, 'invalid_state', 'error', {
        willRedirect: true,
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
        willRedirect: true,
        meta: { errorPagePath: '/auth/error', strategy },
        ...(error instanceof Error ? { originalError: error } : {}),
      });
    }
  })

  /**
   * Google callback
   */
  .openapi(authOAuthRoutes.googleCallback, async (ctx) => {
    const { state, code } = ctx.req.valid('query');
    const strategy = 'google' as EnabledOAuthProvider;

    // Verify cookie by `state` (CSRF protection) & PKCE validation
    const oauthCookie = await getAuthCookie(ctx, `oauth-state-${state}`);
    const cookiePayload: OAuthCookiePayload | null = oauthCookie ? JSON.parse(oauthCookie) : null;

    if (!code || !cookiePayload || !cookiePayload.codeVerifier) {
      throw new AppError(401, 'invalid_state', 'error', {
        willRedirect: true,
        meta: { errorPagePath: '/auth/error', strategy },
      });
    }

    try {
      // Exchange authorization code for access token and fetch Google user info
      const googleValidation = await googleAuth.validateAuthorizationCode(code, cookiePayload.codeVerifier);
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
        willRedirect: true,
        meta: { errorPagePath: '/auth/error', strategy },
        ...(error instanceof Error ? { originalError: error } : {}),
      });
    }
  })
  /**
   * Microsoft callback
   */
  .openapi(authOAuthRoutes.microsoftCallback, async (ctx) => {
    const { state, code } = ctx.req.valid('query');
    const strategy = 'microsoft' as EnabledOAuthProvider;

    // Verify cookie by `state` (CSRF protection) & PKCE validation
    const oauthCookie = await getAuthCookie(ctx, `oauth-state-${state}`);
    const cookiePayload: OAuthCookiePayload | null = oauthCookie ? JSON.parse(oauthCookie) : null;

    if (!code || !cookiePayload || !cookiePayload.codeVerifier) {
      throw new AppError(401, 'invalid_state', 'error', {
        willRedirect: true,
        meta: { errorPagePath: '/auth/error', strategy },
      });
    }

    try {
      // Exchange authorization code for access token and fetch Microsoft user info
      const microsoftValidation = await microsoftAuth.validateAuthorizationCode(code, cookiePayload.codeVerifier);
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
        willRedirect: true,
        meta: { errorPagePath: '/auth/error', strategy },
        ...(error instanceof Error ? { originalError: error } : {}),
      });
    }
  });
export default authOAuthRouteHandlers;
