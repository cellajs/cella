import { z } from '@hono/zod-openapi';
import { appConfig } from 'config';
import { createXRoute } from '#/docs/x-routes';
import { hasSystemAccess, isAuthenticated, isPublicAccess } from '#/middlewares/guard';
import { isNoBot } from '#/middlewares/is-no-bot';
import { emailEnumLimiter, spamLimiter, tokenLimiter } from '#/middlewares/rate-limiter/limiters';
import { emailBodySchema, tokenWithDataSchema } from '#/modules/auth/general/general-schema';
import { cookieSchema, emailOrTokenIdQuerySchema, errorResponseRefs, idSchema, locationSchema } from '#/schemas';
import { mockTokenDataResponse } from '../../../../mocks/mock-auth';

const authGeneralRoutes = {
  /**
   * Auth health check with rate limit status
   */
  health: createXRoute({
    operationId: 'getAuthHealth',
    method: 'get',
    path: '/health',
    xGuard: isPublicAccess,
    tags: ['auth'],
    summary: 'Auth health check',
    description:
      'Returns auth health status including whether the client IP is rate-limited for email enumeration protection.',
    responses: {
      200: {
        description: 'Auth health status',
        content: {
          'application/json': {
            schema: z.object({
              restrictedMode: z.boolean(),
              retryAfter: z.number().optional(),
            }),
          },
        },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Start impersonating
   */
  startImpersonation: createXRoute({
    operationId: 'startImpersonation',
    method: 'get',
    path: '/impersonation/start',
    xGuard: [isAuthenticated, hasSystemAccess],
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
  /**
   * Stop impersonating
   */
  stopImpersonation: createXRoute({
    operationId: 'stopImpersonation',
    method: 'get',
    path: '/impersonation/stop',
    xGuard: isAuthenticated,
    tags: ['auth'],
    summary: 'Stop impersonating',
    description: 'Ends impersonation by clearing the current impersonation session and restoring the admin context.',
    responses: {
      204: { description: 'Stopped impersonating' },
      ...errorResponseRefs,
    },
  }),
  /**
   * Check if email exists
   */
  checkEmail: createXRoute({
    operationId: 'checkEmail',
    method: 'post',
    path: '/check-email',
    xGuard: isPublicAccess,
    xRateLimiter: emailEnumLimiter,
    middleware: isNoBot,
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
  /**
   * Invoke token session
   */
  invokeToken: createXRoute({
    operationId: 'invokeToken',
    method: 'get',
    path: '/invoke-token/{type}/{token}',
    xGuard: isPublicAccess,
    xRateLimiter: tokenLimiter('token'),
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
        description: 'Redirect with token session',
        headers: locationSchema,
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Get token data
   */
  getTokenData: createXRoute({
    operationId: 'getTokenData',
    method: 'get',
    path: '/token/{type}/{id}',
    xGuard: isPublicAccess,
    xRateLimiter: tokenLimiter('token'),
    middleware: isNoBot,
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
        content: { 'application/json': { schema: tokenWithDataSchema, example: mockTokenDataResponse() } },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Resend invitation
   */
  resendInvitationWithToken: createXRoute({
    operationId: 'resendInvitationWithToken',
    method: 'post',
    path: '/resend-invitation',
    xGuard: isPublicAccess,
    xRateLimiter: spamLimiter,
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
  /**
   * Sign out
   */
  signOut: createXRoute({
    operationId: 'signOut',
    method: 'post',
    path: '/sign-out',
    xGuard: isPublicAccess,
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
