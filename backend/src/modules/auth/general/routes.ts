import { z } from '@hono/zod-openapi';
import { appConfig } from 'config';
import { createCustomRoute } from '#/lib/custom-routes';
import { hasSystemAccess, isAuthenticated, isPublicAccess } from '#/middlewares/guard';
import { isNoBot } from '#/middlewares/is-no-bot';
import { emailEnumLimiter, spamLimiter, tokenLimiter } from '#/middlewares/rate-limiter/limiters';
import { emailBodySchema, tokenWithDataSchema } from '#/modules/auth/general/schema';
import { cookieSchema, emailOrTokenIdQuerySchema, idSchema, locationSchema } from '#/utils/schema/common';
import { errorResponseRefs } from '#/utils/schema/error-responses';

const authGeneralRoutes = {
  startImpersonation: createCustomRoute({
    operationId: 'startImpersonation',
    method: 'get',
    path: '/impersonation/start',
    guard: [isAuthenticated, hasSystemAccess],
    tags: ['auth'],
    summary: 'Start impersonating',
    description:
      'Allows a system admin to impersonate a specific user by ID, returning a temporary impersonation session.',
    request: { query: z.object({ targetUserId: z.string() }) },
    responses: {
      204: {
        description: 'Impersonating',
        headers: z.object({ 'Set-Cookie': cookieSchema }),
      },
      ...errorResponseRefs,
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
      204: { description: 'Stopped impersonating' },
      ...errorResponseRefs,
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
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: emailBodySchema } },
      },
    },
    responses: {
      204: { description: 'Email exists' },
      ...errorResponseRefs,
    },
  }),

  invokeToken: createCustomRoute({
    operationId: 'invokeToken',
    method: 'get',
    path: '/invoke-token/{type}/{token}',
    guard: isPublicAccess,
    middleware: [isNoBot, tokenLimiter('token')],
    tags: ['auth'],
    summary: 'Invoke token session',
    description:
      'Validates and invokes a token (for password reset, email verification, invitations, mfa) and redirects user to backend with a one-purpose, single-use token session in a cookie.',
    request: {
      params: z.object({ type: z.enum(appConfig.tokenTypes), token: z.string() }),
    },
    responses: {
      302: {
        description: 'Redirect with token session',
        headers: locationSchema,
      },
      ...errorResponseRefs,
    },
  }),

  getTokenData: createCustomRoute({
    operationId: 'getTokenData',
    method: 'get',
    path: '/token/{type}/{id}',
    guard: isPublicAccess,
    middleware: [isNoBot, tokenLimiter('token')],
    tags: ['auth'],
    summary: 'Get token data',
    description:
      'Get basic token data from single-use token session, It returns basic data if the session is still valid.',
    request: {
      params: z.object({ type: z.enum(appConfig.tokenTypes), id: idSchema }),
    },
    responses: {
      200: {
        description: 'Token is valid',
        content: { 'application/json': { schema: tokenWithDataSchema } },
      },
      ...errorResponseRefs,
    },
  }),

  resendInvitationWithToken: createCustomRoute({
    operationId: 'resendInvitationWithToken',
    method: 'post',
    path: '/resend-invitation',
    guard: isPublicAccess,
    middleware: [spamLimiter],
    tags: ['auth'],
    summary: 'Resend invitation',
    description: 'Resends an invitation email with token to a new user using the provided email address and token ID.',
    request: {
      body: { required: true, content: { 'application/json': { schema: emailOrTokenIdQuerySchema } } },
    },
    responses: {
      204: {
        description: 'Invitation email sent',
      },
      ...errorResponseRefs,
    },
  }),

  signOut: createCustomRoute({
    operationId: 'signOut',
    method: 'post',
    path: '/sign-out',
    guard: isPublicAccess,
    tags: ['auth'],
    summary: 'Sign out',
    description: 'Signs out the *current user* and clears the active session.',
    responses: {
      204: { description: 'User signed out' },
      ...errorResponseRefs,
    },
  }),
};

export default authGeneralRoutes;
