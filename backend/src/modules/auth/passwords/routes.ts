import { z } from '@hono/zod-openapi';
import { createCustomRoute } from '#/lib/custom-routes';
import { isPublicAccess } from '#/middlewares/guard';
import { hasValidSingleUseToken } from '#/middlewares/has-valid-single-use-token';
import { isNoBot } from '#/middlewares/is-no-bot';
import { emailEnumLimiter, passwordLimiter, spamLimiter, tokenLimiter } from '#/middlewares/rate-limiter/limiters';
import { emailBodySchema } from '#/modules/auth/general/schema';
import { emailPasswordBodySchema } from '#/modules/auth/passwords/schema';
import { cookieSchema, locationSchema, passwordSchema } from '#/utils/schema/common';
import { errorResponseRefs } from '#/utils/schema/error-responses';

const authPasswordsRoutes = {
  signUp: createCustomRoute({
    operationId: 'signUp',
    method: 'post',
    path: '/sign-up',
    guard: isPublicAccess,
    middleware: [isNoBot, spamLimiter, emailEnumLimiter],
    tags: ['auth'],
    summary: 'Sign up with password',
    description: 'Registers a new user using an email and password. Sends a verification email upon successful sign up.',
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

  signUpWithToken: createCustomRoute({
    operationId: 'signUpWithToken',
    method: 'post',
    path: '/sign-up/{tokenId}',
    guard: isPublicAccess,
    middleware: [tokenLimiter('signup_invitation'), emailEnumLimiter, hasValidSingleUseToken('invitation')],
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
        content: { 'application/json': { schema: z.object({ membershipInvite: z.boolean() }) } },
      },
      ...errorResponseRefs,
    },
  }),

  requestPassword: createCustomRoute({
    operationId: 'requestPassword',
    method: 'post',
    path: '/request-password',
    guard: isPublicAccess,
    middleware: [spamLimiter, emailEnumLimiter],
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

  createPasswordWithToken: createCustomRoute({
    operationId: 'createPassword',
    method: 'post',
    path: '/create-password/{tokenId}',
    guard: isPublicAccess,
    middleware: [tokenLimiter('password-reset'), hasValidSingleUseToken('password-reset')],
    tags: ['auth'],
    summary: 'Create password',
    description: 'Sets a new password using a single-use session token in cookie and grants a session immediately upon success.',
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
        content: { 'application/json': { schema: z.object({ mfa: z.boolean() }) } },
      },
      ...errorResponseRefs,
    },
  }),

  signIn: createCustomRoute({
    operationId: 'signIn',
    method: 'post',
    path: '/sign-in',
    guard: isPublicAccess,
    middleware: [passwordLimiter],
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
          },
        },
      },
      ...errorResponseRefs,
    },
  }),
};

export default authPasswordsRoutes;
