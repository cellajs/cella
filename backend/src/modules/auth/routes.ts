import { z } from '@hono/zod-openapi';
import { appConfig } from 'config';
import { createCustomRoute } from '#/lib/custom-routes';
import { hasSystemAccess, isAuthenticated, isPublicAccess } from '#/middlewares/guard';
import { hasValidToken } from '#/middlewares/has-valid-token';
import { isNoBot } from '#/middlewares/is-no-bot';
import { emailEnumLimiter, passwordLimiter, spamLimiter, tokenLimiter } from '#/middlewares/rate-limiter/limiters';
import {
  emailBodySchema,
  emailPasswordBodySchema,
  oauthCallbackQuerySchema,
  oauthQuerySchema,
  passkeyChallengeBodySchema,
  passkeyChallengeSchema,
  passkeyVerificationBodySchema,
  tokenWithDataSchema,
  totpVerificationBodySchema,
} from '#/modules/auth/schema';
import { cookieSchema, locationSchema, passwordSchema } from '#/utils/schema/common';
import { errorResponses, redirectResponseSchema, successWithoutDataSchema } from '#/utils/schema/responses';

const authRoutes = {
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

  verifyTotp: createCustomRoute({
    operationId: 'signInWithTotp',
    method: 'post',
    path: '/totp-verification',
    guard: isPublicAccess,
    // TODO look into rate limit customized for totp
    middleware: [spamLimiter],
    tags: ['auth'],
    summary: 'Verify TOTP',
    description: 'Validates the TOTP code and completes TOTP based authentication.',
    security: [],
    request: {
      body: { content: { 'application/json': { schema: totpVerificationBodySchema } } },
    },
    responses: {
      200: {
        description: 'TOTP verified',
        headers: z.object({ 'Set-Cookie': cookieSchema }),
        content: { 'application/json': { schema: successWithoutDataSchema } },
      },
      ...errorResponses,
    },
  }),

  createPasskeyChallenge: createCustomRoute({
    operationId: 'createPasskeyChallenge',
    method: 'post',
    path: '/passkey-challenge',
    guard: isPublicAccess,
    // TODO look into rate limit customized for passkeys
    middleware: [spamLimiter],
    tags: ['auth'],
    summary: 'Create passkey challenge',
    description: 'Initiates the passkey registration or authentication flow by creating a device bound challenge.',
    security: [],
    request: { body: { content: { 'application/json': { schema: passkeyChallengeBodySchema } } } },
    responses: {
      200: {
        description: 'Challenge created',
        content: { 'application/json': { schema: passkeyChallengeSchema } },
      },
      ...errorResponses,
    },
  }),

  signInWithPasskey: createCustomRoute({
    operationId: 'signInWithPasskey',
    method: 'post',
    path: '/passkey-verification',
    guard: isPublicAccess,
    middleware: [tokenLimiter('passkey')],
    tags: ['auth'],
    summary: 'Verify passkey',
    description: 'Validates the signed challenge and completes passkey based authentication.',
    request: {
      body: { content: { 'application/json': { schema: passkeyVerificationBodySchema } } },
    },
    responses: {
      200: {
        description: 'Passkey verified',
        headers: z.object({ 'Set-Cookie': cookieSchema }),
        content: { 'application/json': { schema: successWithoutDataSchema } },
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

  // TODO we can allow a second time using short code from email that has to be manually entered
  consumeToken: createCustomRoute({
    operationId: 'consumeToken',
    method: 'get',
    path: '/consume-token/{token}',
    guard: isPublicAccess,
    middleware: isNoBot,
    tags: ['auth'],
    summary: 'Refresh token',
    description:
      'Validates email token (for password reset, email verification or invitations) and redirects user to backend with a refreshed token in a cookie.',
    request: {
      params: z.object({ token: z.string() }),
    },
    responses: {
      302: {
        description: 'Redirect with refreshed token in cookie',
        headers: locationSchema,
      },
      ...errorResponses,
    },
  }),

  // TODO remove
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

export default authRoutes;
