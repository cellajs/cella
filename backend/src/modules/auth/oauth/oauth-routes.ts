import { z } from '@hono/zod-openapi';
import { createXRoute } from '#/core/x-routes';
import { publicGuard, stepUpGuard, userGuard } from '#/middlewares/guard';
import { singlePointsLimiter, tokenLimiter } from '#/middlewares/rate-limiter/limiters';
import { oauthCallbackQuerySchema, oauthQuerySchema } from '#/modules/auth/oauth/oauth-schema';
import { cookieSchema, errorResponseRefs, locationSchema } from '#/schemas';

const authOAuthRoutes = {
  startOAuthConnect: createXRoute({
    operationId: 'startOAuthConnect',
    'x-strategy': 'oauth',
    method: 'post',
    path: '/oauth-connect',
    xGuard: [userGuard, stepUpGuard],
    xRateLimiter: [singlePointsLimiter],
    tags: ['auth', 'cella'],
    summary: 'Start connecting a provider',
    description:
      "Pins this browser's next provider sign-in with `type=connect` to the current user, for ten minutes and once: the provider's callback connects the provider account to the user that started it. Call it right before sending the browser to the provider.",
    responses: {
      204: {
        description: 'Connect pinned',
        headers: z.object({ 'Set-Cookie': cookieSchema }),
      },
      ...errorResponseRefs,
    },
  }),
  github: createXRoute({
    operationId: 'github',
    'x-strategy': { oauth: 'github' },
    method: 'get',
    path: '/github',
    xGuard: [publicGuard],
    tags: ['auth', 'cella'],
    summary: 'Authenticate with GitHub',
    description:
      'Starts OAuth authentication with GitHub. Can be used for account connection, email verification, invitation process, defaults to authentication.',
    request: { query: oauthQuerySchema },
    responses: {
      302: {
        description: 'Redirect to GitHub',
        headers: locationSchema,
      },
      ...errorResponseRefs,
    },
  }),
  githubCallback: createXRoute({
    operationId: 'githubCallback',
    'x-strategy': { oauth: 'github' },
    method: 'get',
    path: '/github/callback',
    xGuard: [publicGuard],
    xRateLimiter: [tokenLimiter('github')],
    tags: ['auth', 'cella'],
    summary: 'Callback for GitHub',
    description: 'Handles GitHub OAuth callback, retrieves user identity, and establishes a session or links account.',
    request: {
      query: oauthCallbackQuerySchema.extend({
        error: z.string().optional(),
        error_description: z.string().optional(),
        error_uri: z.string().optional(),
      }),
    },
    responses: {
      302: {
        description: 'Redirect to frontend',
        headers: locationSchema,
      },
      ...errorResponseRefs,
    },
  }),
  google: createXRoute({
    operationId: 'google',
    'x-strategy': { oauth: 'google' },
    method: 'get',
    path: '/google',
    xGuard: [publicGuard],
    tags: ['auth', 'cella'],
    summary: 'Authenticate with Google',
    description:
      'Starts OAuth authentication with Google. Can be used for account connection, email verification, invitation process, defaults to authentication.',
    request: { query: oauthQuerySchema },
    responses: {
      302: {
        description: 'Redirect to Google',
        headers: locationSchema,
      },
      ...errorResponseRefs,
    },
  }),
  googleCallback: createXRoute({
    operationId: 'googleCallback',
    'x-strategy': { oauth: 'google' },
    method: 'get',
    path: '/google/callback',
    xGuard: [publicGuard],
    xRateLimiter: [tokenLimiter('google')],
    tags: ['auth', 'cella'],
    summary: 'Callback for Google',
    description: 'Handles Google OAuth callback, retrieves user identity, and establishes a session or links account.',
    request: { query: oauthCallbackQuerySchema },
    responses: {
      302: {
        description: 'Redirect to frontend',
        headers: locationSchema,
      },
      ...errorResponseRefs,
    },
  }),
  microsoft: createXRoute({
    operationId: 'microsoft',
    'x-strategy': { oauth: 'microsoft' },
    method: 'get',
    path: '/microsoft',
    xGuard: [publicGuard],
    tags: ['auth', 'cella'],
    summary: 'Authenticate with Microsoft',
    description:
      'Starts OAuth authentication with Microsoft. Can be used for account connection, email verification, invitation process, defaults to authentication.',
    request: { query: oauthQuerySchema },
    responses: {
      302: {
        description: 'Redirect to Microsoft',
        headers: locationSchema,
      },
      ...errorResponseRefs,
    },
  }),
  microsoftCallback: createXRoute({
    operationId: 'microsoftCallback',
    'x-strategy': { oauth: 'microsoft' },
    method: 'get',
    path: '/microsoft/callback',
    xGuard: [publicGuard],
    xRateLimiter: [tokenLimiter('microsoft')],
    tags: ['auth', 'cella'],
    summary: 'Callback for Microsoft',
    description:
      'Handles Microsoft OAuth callback, retrieves user identity, and establishes a session or links account.',
    request: { query: oauthCallbackQuerySchema },
    responses: {
      302: {
        description: 'Redirect to frontend',
        headers: locationSchema,
      },
      ...errorResponseRefs,
    },
  }),
};

export { authOAuthRoutes };
