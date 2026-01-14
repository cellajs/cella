import { z } from '@hono/zod-openapi';
import { createXRoute } from '#/lib/x-routes';
import { isPublicAccess } from '#/middlewares/guard';
import { tokenLimiter } from '#/middlewares/rate-limiter/limiters';
import { oauthCallbackQuerySchema, oauthQuerySchema } from '#/modules/auth/oauth/schema';
import { locationSchema } from '#/utils/schema/common';
import { errorResponseRefs } from '#/utils/schema/error-responses';

const authOAuthRoutes = {
  /**
   * Authenticate with GitHub
   */
  github: createXRoute({
    operationId: 'github',
    method: 'get',
    path: '/github',
    xGuard: isPublicAccess,
    tags: ['auth'],
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
  /**
   * Callback for GitHub
   */
  githubCallback: createXRoute({
    operationId: 'githubCallback',
    method: 'get',
    path: '/github/callback',
    xGuard: isPublicAccess,
    xRateLimiter: tokenLimiter('github'),
    tags: ['auth'],
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
  /**
   * Authenticate with Google
   */
  google: createXRoute({
    operationId: 'google',
    method: 'get',
    path: '/google',
    xGuard: isPublicAccess,
    tags: ['auth'],
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
  /**
   * Callback for Google
   */
  googleCallback: createXRoute({
    operationId: 'googleCallback',
    method: 'get',
    path: '/google/callback',
    xGuard: isPublicAccess,
    xRateLimiter: tokenLimiter('google'),
    tags: ['auth'],
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
  /**
   * Authenticate with Microsoft
   */
  microsoft: createXRoute({
    operationId: 'microsoft',
    method: 'get',
    path: '/microsoft',
    xGuard: isPublicAccess,
    tags: ['auth'],
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
  /**
   * Callback for Microsoft
   */
  microsoftCallback: createXRoute({
    operationId: 'microsoftCallback',
    method: 'get',
    path: '/microsoft/callback',
    xGuard: isPublicAccess,
    xRateLimiter: tokenLimiter('microsoft'),
    tags: ['auth'],
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

export default authOAuthRoutes;
