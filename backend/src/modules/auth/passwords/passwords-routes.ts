import { z } from '@hono/zod-openapi';
import { createXRoute } from '#/docs/x-routes';
import { isPublicAccess } from '#/middlewares/guard';
import { hasValidSingleUseToken } from '#/middlewares/has-valid-single-use-token';
import { isNoBot } from '#/middlewares/is-no-bot';
import { emailEnumLimiter, passwordLimiter, spamLimiter, tokenLimiter } from '#/middlewares/rate-limiter/limiters';
import { emailBodySchema } from '#/modules/auth/general/general-schema';
import { emailPasswordBodySchema } from '#/modules/auth/passwords/passwords-schema';
import { cookieSchema, errorResponseRefs, locationSchema, passwordSchema } from '#/schemas';
import {
  mockCreatePasswordResponse,
  mockSignInResponse,
  mockSignUpWithTokenResponse,
} from '../../../../mocks/mock-auth';

const authPasswordsRoutes = {
  /**
   * Sign up with password
   */
  signUp: createXRoute({
    operationId: 'signUp',
    method: 'post',
    path: '/sign-up',
    xGuard: isPublicAccess,
    xRateLimiter: [spamLimiter, emailEnumLimiter],
    middleware: [isNoBot],
    tags: ['auth'],
    summary: 'Sign up with password',
    description:
      'Registers a new user using an email and password. Sends a verification email upon successful sign up.',
    request: {
      body: {
        content: { 'application/json': { schema: emailPasswordBodySchema } },
      },
    },
    responses: {
      201: {
        description: 'User signed up',
        headers: z.object({ 'Set-Cookie': cookieSchema }),
      },
      302: {
        headers: locationSchema,
        description: 'Redirect to frontend',
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Sign up to accept invite
   */
  signUpWithToken: createXRoute({
    operationId: 'signUpWithToken',
    method: 'post',
    path: '/sign-up/{tokenId}',
    xGuard: isPublicAccess,
    xRateLimiter: [tokenLimiter('signup_invitation'), emailEnumLimiter],
    middleware: [hasValidSingleUseToken('invitation')],
    tags: ['auth'],
    summary: 'Sign up to accept invite',
    description: 'Registers a user using an email and password in response to a system or organization invitation.',
    request: {
      params: z.object({ tokenId: z.string() }),
      body: {
        required: true,
        content: { 'application/json': { schema: emailPasswordBodySchema } },
      },
    },
    responses: {
      201: {
        description: 'User signed up',
        headers: z.object({ 'Set-Cookie': cookieSchema }),
        content: {
          'application/json': {
            schema: z.object({ membershipInvite: z.boolean() }),
            example: mockSignUpWithTokenResponse(),
          },
        },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Request new password
   */
  requestPassword: createXRoute({
    operationId: 'requestPassword',
    method: 'post',
    path: '/request-password',
    xGuard: isPublicAccess,
    xRateLimiter: [spamLimiter, emailEnumLimiter],
    tags: ['auth'],
    summary: 'Request new password',
    description: "Sends an email with a link to reset the user's password.",
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: emailBodySchema } },
      },
    },
    responses: {
      204: {
        description: 'Password reset email sent',
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Create password
   */
  createPasswordWithToken: createXRoute({
    operationId: 'createPassword',
    method: 'post',
    path: '/create-password/{tokenId}',
    xGuard: isPublicAccess,
    xRateLimiter: tokenLimiter('password-reset'),
    middleware: [hasValidSingleUseToken('password-reset')],
    tags: ['auth'],
    summary: 'Create password',
    description:
      'Sets a new password using a single-use session token in cookie and grants a session immediately upon success.',
    request: {
      params: z.object({ tokenId: z.string() }),
      body: {
        required: true,
        content: { 'application/json': { schema: z.object({ password: passwordSchema }) } },
      },
    },
    responses: {
      201: {
        description: 'Password created',
        content: {
          'application/json': { schema: z.object({ mfa: z.boolean() }), example: mockCreatePasswordResponse() },
        },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Sign in with password
   */
  signIn: createXRoute({
    operationId: 'signIn',
    method: 'post',
    path: '/sign-in',
    xGuard: isPublicAccess,
    xRateLimiter: passwordLimiter,
    tags: ['auth'],
    summary: 'Sign in with password',
    description: 'Authenticates an existing user using their email and password.',
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: emailPasswordBodySchema } },
      },
    },
    responses: {
      200: {
        description: 'User signed in',
        headers: z.object({ 'Set-Cookie': cookieSchema.optional() }),
        content: {
          'application/json': {
            schema: z.object({ emailVerified: z.boolean(), mfa: z.boolean().optional() }),
            example: mockSignInResponse(),
          },
        },
      },
      ...errorResponseRefs,
    },
  }),
};

export default authPasswordsRoutes;
