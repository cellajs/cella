import { z } from '@hono/zod-openapi';
import { createXRoutes, errors, xRoute } from '#/core/x-routes';
import { publicGuard, stepUpGuard, userGuard } from '#/middlewares/guard';
import { singlePointsLimiter, tokenLimiter } from '#/middlewares/rate-limiter/limiters';
import { oauthCallbackQuerySchema, oauthQuerySchema } from '#/modules/auth/oauth/oauth-schema';
import { cookieSchema, locationSchema } from '#/schemas';

const authOAuthRoutes = createXRoutes(['auth', 'cella'], {
  startOAuthConnect: xRoute({
    method: 'post',
    path: '/oauth-connect',
    xEnabledBy: { strategy: 'oauth' },
    xGuard: [userGuard, stepUpGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Start connecting a provider',
    description:
      "Pins this browser's next provider sign-in with `type=connect` to the current user, for ten minutes and once: the provider's callback connects the provider account to the user that started it. Call it right before sending the browser to the provider.",
    responses: { 204: { description: 'Connect pinned', headers: z.object({ 'Set-Cookie': cookieSchema }) } },
  }),
  github: xRoute({
    method: 'get',
    path: '/github',
    xEnabledBy: { strategy: 'oauth', provider: 'github' },
    xGuard: [publicGuard],
    summary: 'Authenticate with GitHub',
    description:
      'Starts OAuth authentication with GitHub. Can be used for account connection, email verification, invitation process, defaults to authentication.',
    request: { query: oauthQuerySchema },
    responses: { 302: { description: 'Redirect to GitHub', headers: locationSchema }, ...errors(401) },
  }),
  githubCallback: xRoute({
    method: 'get',
    path: '/github/callback',
    xEnabledBy: { strategy: 'oauth', provider: 'github' },
    xGuard: [publicGuard],
    xRateLimiter: [tokenLimiter('github')],
    summary: 'Callback for GitHub',
    description: 'Handles GitHub OAuth callback, retrieves user identity, and establishes a session or links account.',
    request: { query: oauthCallbackQuerySchema },
    responses: { 302: { description: 'Redirect to frontend', headers: locationSchema }, ...errors(401, 403, 404, 409) },
  }),
  google: xRoute({
    method: 'get',
    path: '/google',
    xEnabledBy: { strategy: 'oauth', provider: 'google' },
    xGuard: [publicGuard],
    summary: 'Authenticate with Google',
    description:
      'Starts OAuth authentication with Google. Can be used for account connection, email verification, invitation process, defaults to authentication.',
    request: { query: oauthQuerySchema },
    responses: { 302: { description: 'Redirect to Google', headers: locationSchema }, ...errors(401) },
  }),
  googleCallback: xRoute({
    method: 'get',
    path: '/google/callback',
    xEnabledBy: { strategy: 'oauth', provider: 'google' },
    xGuard: [publicGuard],
    xRateLimiter: [tokenLimiter('google')],
    summary: 'Callback for Google',
    description: 'Handles Google OAuth callback, retrieves user identity, and establishes a session or links account.',
    request: { query: oauthCallbackQuerySchema },
    responses: { 302: { description: 'Redirect to frontend', headers: locationSchema }, ...errors(401, 403, 404, 409) },
  }),
  microsoft: xRoute({
    method: 'get',
    path: '/microsoft',
    xEnabledBy: { strategy: 'oauth', provider: 'microsoft' },
    xGuard: [publicGuard],
    summary: 'Authenticate with Microsoft',
    description:
      'Starts OAuth authentication with Microsoft. Can be used for account connection, email verification, invitation process, defaults to authentication.',
    request: { query: oauthQuerySchema },
    responses: { 302: { description: 'Redirect to Microsoft', headers: locationSchema }, ...errors(401) },
  }),
  microsoftCallback: xRoute({
    method: 'get',
    path: '/microsoft/callback',
    xEnabledBy: { strategy: 'oauth', provider: 'microsoft' },
    xGuard: [publicGuard],
    xRateLimiter: [tokenLimiter('microsoft')],
    summary: 'Callback for Microsoft',
    description: 'Handles Microsoft OAuth callback, retrieves user identity, and establishes a session or links account.',
    request: { query: oauthCallbackQuerySchema },
    responses: { 302: { description: 'Redirect to frontend', headers: locationSchema }, ...errors(401, 403, 404, 409) },
  }),
});

export { authOAuthRoutes };
