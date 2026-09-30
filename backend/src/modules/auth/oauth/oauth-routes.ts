import { z } from '@hono/zod-openapi';
import { createXRoutes, xRoute } from '#/core/x-routes';
import { publicGuard, stepUpGuard, userGuard } from '#/middlewares/guard';
import { singlePointsLimiter, tokenLimiter } from '#/middlewares/rate-limiter/limiters';
import { oauthCallbackQuerySchema, oauthQuerySchema } from '#/modules/auth/oauth/oauth-schema';
import { cookieSchema, locationSchema } from '#/schemas';

const authOAuthRoutes = createXRoutes(['auth', 'cella'], {
  startOAuthConnect: xRoute({
    'x-strategy': 'oauth',
    method: 'post',
    path: '/oauth-connect',
    xGuard: [userGuard, stepUpGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Start connecting a provider',
    description:
      "Pins this browser's next provider sign-in with `type=connect` to the current user, for ten minutes and once: the provider's callback connects the provider account to the user that started it. Call it right before sending the browser to the provider.",
    responses: { 204: { description: 'Connect pinned', headers: z.object({ 'Set-Cookie': cookieSchema }) } },
  }),
  github: xRoute({
    'x-strategy': { oauth: 'github' },
    method: 'get',
    path: '/github',
    xGuard: [publicGuard],
    summary: 'Authenticate with GitHub',
    description:
      'Starts OAuth authentication with GitHub. Can be used for account connection, email verification, invitation process, defaults to authentication.',
    request: { query: oauthQuerySchema },
    responses: { 302: { description: 'Redirect to GitHub', headers: locationSchema } },
  }),
  githubCallback: xRoute({
    'x-strategy': { oauth: 'github' },
    method: 'get',
    path: '/github/callback',
    xGuard: [publicGuard],
    xRateLimiter: [tokenLimiter('github')],
    summary: 'Callback for GitHub',
    description: 'Handles GitHub OAuth callback, retrieves user identity, and establishes a session or links account.',
    request: { query: oauthCallbackQuerySchema },
    responses: { 302: { description: 'Redirect to frontend', headers: locationSchema } },
  }),
  google: xRoute({
    'x-strategy': { oauth: 'google' },
    method: 'get',
    path: '/google',
    xGuard: [publicGuard],
    summary: 'Authenticate with Google',
    description:
      'Starts OAuth authentication with Google. Can be used for account connection, email verification, invitation process, defaults to authentication.',
    request: { query: oauthQuerySchema },
    responses: { 302: { description: 'Redirect to Google', headers: locationSchema } },
  }),
  googleCallback: xRoute({
    'x-strategy': { oauth: 'google' },
    method: 'get',
    path: '/google/callback',
    xGuard: [publicGuard],
    xRateLimiter: [tokenLimiter('google')],
    summary: 'Callback for Google',
    description: 'Handles Google OAuth callback, retrieves user identity, and establishes a session or links account.',
    request: { query: oauthCallbackQuerySchema },
    responses: { 302: { description: 'Redirect to frontend', headers: locationSchema } },
  }),
  microsoft: xRoute({
    'x-strategy': { oauth: 'microsoft' },
    method: 'get',
    path: '/microsoft',
    xGuard: [publicGuard],
    summary: 'Authenticate with Microsoft',
    description:
      'Starts OAuth authentication with Microsoft. Can be used for account connection, email verification, invitation process, defaults to authentication.',
    request: { query: oauthQuerySchema },
    responses: { 302: { description: 'Redirect to Microsoft', headers: locationSchema } },
  }),
  microsoftCallback: xRoute({
    'x-strategy': { oauth: 'microsoft' },
    method: 'get',
    path: '/microsoft/callback',
    xGuard: [publicGuard],
    xRateLimiter: [tokenLimiter('microsoft')],
    summary: 'Callback for Microsoft',
    description:
      'Handles Microsoft OAuth callback, retrieves user identity, and establishes a session or links account.',
    request: { query: oauthCallbackQuerySchema },
    responses: { 302: { description: 'Redirect to frontend', headers: locationSchema } },
  }),
});

export { authOAuthRoutes };
