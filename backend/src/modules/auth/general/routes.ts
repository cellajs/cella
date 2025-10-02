import { z } from '@hono/zod-openapi';
import { appConfig } from 'config';
import { createCustomRoute } from '#/lib/custom-routes';
import { hasSystemAccess, isAuthenticated, isPublicAccess } from '#/middlewares/guard';
import { isNoBot } from '#/middlewares/is-no-bot';
import { emailEnumLimiter } from '#/middlewares/rate-limiter/limiters';
import { emailBodySchema, tokenWithDataSchema } from '#/modules/auth/general/schema';
import { cookieSchema, locationSchema } from '#/utils/schema/common';
import { errorResponses, successWithoutDataSchema } from '#/utils/schema/responses';

const authGeneralRoutes = {
  startImpersonation: createCustomRoute({
    operationId: 'startImpersonation',
    method: 'get',
    path: '/impersonation/start',
    guard: [isAuthenticated, hasSystemAccess],
    tags: ['auth'],
    summary: 'Start impersonating',
    description: 'Allows a system admin to impersonate a specific user by ID, returning a temporary impersonation session.',
    request: { query: z.object({ targetUserId: z.string() }) },
    responses: {
      200: {
        description: 'Impersonating',
        headers: z.object({
          'Set-Cookie': cookieSchema,
        }),
        content: {
          'application/json': {
            schema: successWithoutDataSchema,
          },
        },
      },
      ...errorResponses,
    },
  }),

  stopImpersonation: createCustomRoute({
    operationId: 'stopImpersonation',
    method: 'get',
    path: '/impersonation/stop',
    guard: isAuthenticated,
    tags: ['auth'],
    summary: 'Stop impersonating',
    description: 'Ends impersonation by clearing the current impersonation session and restoring the admin context.',
    responses: {
      200: {
        description: 'Stopped impersonating',
        content: {
          'application/json': {
            schema: successWithoutDataSchema,
          },
        },
      },
      ...errorResponses,
    },
  }),

  checkEmail: createCustomRoute({
    operationId: 'checkEmail',
    method: 'post',
    path: '/check-email',
    guard: isPublicAccess,
    middleware: [isNoBot, emailEnumLimiter],
    tags: ['auth'],
    summary: 'Check if email exists',
    description: 'Checks if a user with the specified email address exists in the system.',
    security: [],
    request: {
      body: {
        content: {
          'application/json': {
            schema: emailBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Email exists',
        content: {
          'application/json': {
            schema: successWithoutDataSchema,
          },
        },
      },
      ...errorResponses,
    },
  }),

  invokeToken: createCustomRoute({
    operationId: 'invokeToken',
    method: 'get',
    path: '/invoke-token/{type}/{token}',
    guard: isPublicAccess,
    middleware: isNoBot,
    tags: ['auth'],
    summary: 'Invoke token session',
    description:
      'Validates and invokes a token (for password reset, email verification, invitations, mfa) and redirects user to backend with a one-purpose, single-use token session in a cookie.',
    request: {
      params: z.object({ type: z.enum(appConfig.tokenTypes), token: z.string() }),
    },
    responses: {
      302: {
        description: 'Redirect with refreshed token in cookie',
        headers: locationSchema,
      },
      ...errorResponses,
    },
  }),

  getTokenData: createCustomRoute({
    operationId: 'getTokenData',
    method: 'get',
    path: '/token/{tokenId}',
    guard: isPublicAccess,
    middleware: isNoBot,
    tags: ['auth'],
    summary: 'Get token data',
    description:
      'Get basic token data by id, for password reset and invitation. It returns if the token is still valid and returns basic data if valid.',
    request: {
      params: z.object({ tokenId: z.string() }),
      query: z.object({ type: z.enum(appConfig.tokenTypes) }),
    },
    responses: {
      200: {
        description: 'Token is valid',
        content: { 'application/json': { schema: tokenWithDataSchema } },
      },
      ...errorResponses,
    },
  }),

  signOut: createCustomRoute({
    operationId: 'signOut',
    method: 'get',
    path: '/sign-out',
    guard: isPublicAccess,
    tags: ['auth'],
    summary: 'Sign out',
    description: 'Signs out the *current user* and clears the active session.',
    responses: {
      200: {
        description: 'User signed out',
        content: { 'application/json': { schema: successWithoutDataSchema } },
      },
      ...errorResponses,
    },
  }),
};

export default authGeneralRoutes;
