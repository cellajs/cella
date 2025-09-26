import { z } from '@hono/zod-openapi';
import { createCustomRoute } from '#/lib/custom-routes';
import { isPublicAccess } from '#/middlewares/guard';
import { hasValidToken } from '#/middlewares/has-valid-token';
import { isNoBot } from '#/middlewares/is-no-bot';
import { emailEnumLimiter, passwordLimiter, spamLimiter, tokenLimiter } from '#/middlewares/rate-limiter/limiters';
import { cookieSchema, locationSchema, passwordSchema } from '#/utils/schema/common';
import { errorResponses, redirectResponseSchema, successWithoutDataSchema } from '#/utils/schema/responses';
import { emailBodySchema } from '../general/schema';
import { emailPasswordBodySchema } from './schema';

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
    security: [],
    request: {
      body: {
        content: { 'application/json': { schema: emailPasswordBodySchema } },
      },
    },
    responses: {
      200: {
        description: 'User signed up',
        headers: z.object({ 'Set-Cookie': cookieSchema }),
        content: { 'application/json': { schema: successWithoutDataSchema } },
      },
      302: {
        headers: locationSchema,
        description: 'Redirect to frontend',
      },
      ...errorResponses,
    },
  }),

  signUpWithToken: createCustomRoute({
    operationId: 'signUpWithToken',
    method: 'post',
    path: '/sign-up/{tokenId}',
    guard: isPublicAccess,
    middleware: [tokenLimiter('signup_invitation'), emailEnumLimiter, hasValidToken('invitation')],
    tags: ['auth'],
    summary: 'Sign up to accept invite',
    description: 'Registers a user using an email and password in response to a system or organization invitation.',
    security: [],
    request: {
      params: z.object({ tokenId: z.string() }),
      body: { content: { 'application/json': { schema: emailPasswordBodySchema } } },
    },
    responses: {
      200: {
        description: 'User signed up',
        headers: z.object({ 'Set-Cookie': cookieSchema }),
        content: { 'application/json': { schema: redirectResponseSchema } },
      },
      ...errorResponses,
    },
  }),

  verifyEmail: createCustomRoute({
    operationId: 'verifyEmail',
    method: 'get',
    path: '/verify-email/{tokenId}',
    guard: isPublicAccess,
    middleware: [tokenLimiter('email_verification'), hasValidToken('email_verification')],
    tags: ['auth'],
    summary: 'Verify email by token',
    description: "Verifies a user's email using a single-use session token in cookie. Grants a session upon success.",
    security: [],
    request: {
      params: z.object({ tokenId: z.string() }),
      query: z.object({ redirect: z.string().optional() }),
    },
    responses: {
      302: {
        description: 'Session created and redirected',
        headers: locationSchema,
      },
      ...errorResponses,
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
    security: [],
    request: {
      body: { content: { 'application/json': { schema: emailBodySchema } } },
    },
    responses: {
      200: {
        description: 'Password reset email sent',
        content: { 'application/json': { schema: successWithoutDataSchema } },
      },
      ...errorResponses,
    },
  }),

  createPasswordWithToken: createCustomRoute({
    operationId: 'createPassword',
    method: 'post',
    path: '/create-password/{tokenId}',
    guard: isPublicAccess,
    middleware: [tokenLimiter('password_reset'), hasValidToken('password_reset')],
    tags: ['auth'],
    summary: 'Create password',
    description: 'Sets a new password using a single-use session token in cookie and grants a session immediately upon success.',
    security: [],
    request: {
      params: z.object({ tokenId: z.string() }),
      body: { content: { 'application/json': { schema: z.object({ password: passwordSchema }) } } },
    },
    responses: {
      200: {
        description: 'Password created',
        content: { 'application/json': { schema: redirectResponseSchema } },
      },
      ...errorResponses,
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
    security: [],
    request: {
      body: { content: { 'application/json': { schema: emailPasswordBodySchema } } },
    },
    responses: {
      200: {
        description: 'User signed in',
        headers: z.object({ 'Set-Cookie': cookieSchema.optional() }),
        content: { 'application/json': { schema: redirectResponseSchema } },
      },
      ...errorResponses,
    },
  }),
};

export default authPasswordsRoutes;
