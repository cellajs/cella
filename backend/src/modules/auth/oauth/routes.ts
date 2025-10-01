import { z } from '@hono/zod-openapi';
import { createCustomRoute } from '#/lib/custom-routes';
import { isPublicAccess } from '#/middlewares/guard';
import { tokenLimiter } from '#/middlewares/rate-limiter/limiters';
import { oauthCallbackQuerySchema, oauthQuerySchema } from '#/modules/auth/oauth/schema';
import { locationSchema } from '#/utils/schema/common';
import { errorResponses } from '#/utils/schema/responses';

const authOAuthRoutes = {
  github: createCustomRoute({
    operationId: 'github',
    method: 'get',
    path: '/github',
    guard: isPublicAccess,
    tags: ['auth'],
    summary: 'Authenticate with GitHub',
    description:
      'Starts OAuth authentication with GitHub. Can be used for account connection, email verification, invitation process, defaults to authentication.',
    security: [],
    request: { query: oauthQuerySchema },
    responses: {
      302: {
        description: 'Redirect to GitHub',
        headers: locationSchema,
      },
      ...errorResponses,
    },
  }),

  githubCallback: createCustomRoute({
    operationId: 'githubCallback',
    method: 'get',
    path: '/github/callback',
    guard: isPublicAccess,
    middleware: [tokenLimiter('github')],
    tags: ['auth'],
    summary: 'Callback for GitHub',
    description: 'Handles GitHub OAuth callback, retrieves user identity, and establishes a session or links account.',
    security: [],
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
      ...errorResponses,
    },
  }),

  google: createCustomRoute({
    operationId: 'google',
    method: 'get',
    path: '/google',
    guard: isPublicAccess,
    tags: ['auth'],
    summary: 'Authenticate with Google',
    description:
      'Starts OAuth authentication with Google. Can be used for account connection, email verification, invitation process, defaults to authentication.',
    security: [],
    request: { query: oauthQuerySchema },
    responses: {
      302: {
        description: 'Redirect to Google',
        headers: locationSchema,
      },
      ...errorResponses,
    },
  }),

  googleCallback: createCustomRoute({
    operationId: 'googleCallback',
    method: 'get',
    path: '/google/callback',
    guard: isPublicAccess,
    middleware: [tokenLimiter('google')],
    tags: ['auth'],
    summary: 'Callback for Google',
    description: 'Handles Google OAuth callback, retrieves user identity, and establishes a session or links account.',
    security: [],
    request: { query: oauthCallbackQuerySchema },
    responses: {
      302: {
        description: 'Redirect to frontend',
        headers: locationSchema,
      },
      ...errorResponses,
    },
  }),

  microsoft: createCustomRoute({
    operationId: 'microsoft',
    method: 'get',
    path: '/microsoft',
    guard: isPublicAccess,
    tags: ['auth'],
    summary: 'Authenticate with Microsoft',
    description:
      'Starts OAuth authentication with Microsoft. Can be used for account connection, email verification, invitation process, defaults to authentication.',
    security: [],
    request: { query: oauthQuerySchema },
    responses: {
      302: {
        description: 'Redirect to Microsoft',
        headers: locationSchema,
      },
      ...errorResponses,
    },
  }),

  microsoftCallback: createCustomRoute({
    operationId: 'microsoftCallback',
    method: 'get',
    path: '/microsoft/callback',
    guard: isPublicAccess,
    middleware: [tokenLimiter('microsoft')],
    tags: ['auth'],
    summary: 'Callback for Microsoft',
    description: 'Handles Microsoft OAuth callback, retrieves user identity, and establishes a session or links account.',
    security: [],
    request: { query: oauthCallbackQuerySchema },
    responses: {
      302: {
        description: 'Redirect to frontend',
        headers: locationSchema,
      },
      ...errorResponses,
    },
  }),
};

export default authOAuthRoutes;
