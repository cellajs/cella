import { z } from '@hono/zod-openapi';
import { appConfig } from 'config';
import { createCustomRoute } from '#/lib/custom-routes';
import { hasSystemAccess, isAuthenticated, isPublicAccess } from '#/middlewares/guard';
import { hasValidToken } from '#/middlewares/has-valid-token';
import { emailEnumLimiter, passwordLimiter, spamLimiter, tokenLimiter } from '#/middlewares/rate-limiter/limiters';
import {
  emailBodySchema,
  emailPasswordBodySchema,
  oauthCallbackQuerySchema,
  oauthQuerySchema,
  passkeyChallengeQuerySchema,
  passkeyVerificationBodySchema,
  tokenWithDataSchema,
} from '#/modules/auth/schema';
import { entityBaseSchema } from '#/modules/entities/schema';
import { membershipSummarySchema } from '#/modules/memberships/schema';
import { cookieSchema, idSchema, passwordSchema, tokenParamSchema } from '#/utils/schema/common';
import { errorResponses, successWithoutDataSchema } from '#/utils/schema/responses';

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
    guard: isPublicAccess,
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
    middleware: [emailEnumLimiter],
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
    middleware: [spamLimiter, emailEnumLimiter],
    tags: ['auth'],
    summary: 'Sign up with password',
    description: 'Registers a new user using an email and password. Sends a verification email upon successful sign up.',
    security: [],
    request: {
      body: {
        content: {
          'application/json': {
            schema: emailPasswordBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'User signed up',
        headers: z.object({
          'Set-Cookie': cookieSchema,
        }),
        content: {
          'application/json': {
            schema: successWithoutDataSchema,
          },
        },
      },
      302: {
        headers: z.object({ Location: z.string() }),
        description: 'Redirect to frontend',
      },
      ...errorResponses,
    },
  }),
  signUpWithToken: createCustomRoute({
    operationId: 'signUpWithToken',
    method: 'post',
    path: '/sign-up/{token}',
    guard: isPublicAccess,
    middleware: [spamLimiter, emailEnumLimiter, hasValidToken('invitation')],
    tags: ['auth'],
    summary: 'Sign up to accept invite',
    description: 'Registers a user using an email and password in response to a system or organization invitation.',
    security: [],
    request: {
      params: tokenParamSchema,
      body: {
        content: {
          'application/json': {
            schema: emailPasswordBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'User signed up',
        headers: z.object({
          'Set-Cookie': cookieSchema,
        }),
        content: {
          'application/json': {
            schema: successWithoutDataSchema,
          },
        },
      },
      302: {
        headers: z.object({ Location: z.string() }),
        description: 'Redirect to frontend',
      },
      ...errorResponses,
    },
  }),

  verifyEmail: createCustomRoute({
    operationId: 'verifyEmail',
    method: 'get',
    path: '/verify-email/{token}',
    guard: isPublicAccess,
    middleware: [tokenLimiter('email_verification'), hasValidToken('email_verification')],
    tags: ['auth'],
    summary: 'Verify email by token',
    description: "Verifies a user's email using a token from their verification email. Grants a session upon success.",
    security: [],
    request: {
      params: tokenParamSchema,
      query: z.object({ redirect: z.string().optional(), tokenId: z.string() }),
    },
    responses: {
      302: {
        description: 'Session created and redirected',
        headers: z.object({ Location: z.string() }),
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
        description: 'Password reset email sent',
        content: {
          'application/json': {
            schema: successWithoutDataSchema,
          },
        },
      },
      ...errorResponses,
    },
  }),
  createPasswordWithToken: createCustomRoute({
    operationId: 'createPassword',
    method: 'post',
    path: '/create-password/{token}',
    guard: isPublicAccess,
    middleware: [tokenLimiter('password_reset'), hasValidToken('password_reset')],
    tags: ['auth'],
    summary: 'Create password by token',
    description: 'Sets a new password using a token and grants a session immediately upon success.',
    security: [],
    request: {
      params: z.object({ token: z.string() }),
      body: {
        content: {
          'application/json': {
            schema: z.object({ password: passwordSchema }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Password created',
        content: {
          'application/json': {
            schema: successWithoutDataSchema,
          },
        },
      },
      ...errorResponses,
    },
  }),
  verifyPasskey: createCustomRoute({
    operationId: 'signInWithPasskey',
    method: 'post',
    path: '/passkey-verification',
    guard: isPublicAccess,
    middleware: [tokenLimiter('passkey')],
    tags: ['auth'],
    summary: 'Verify passkey',
    description: 'Validates the signed challenge and completes passkey based authentication.',
    request: {
      body: {
        content: {
          'application/json': {
            schema: passkeyVerificationBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Passkey verified',
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
      body: {
        content: {
          'application/json': {
            schema: emailPasswordBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'User signed in',
        headers: z.object({
          'Set-Cookie': cookieSchema,
        }),
        content: { 'application/json': { schema: successWithoutDataSchema } },
      },
      ...errorResponses,
    },
  }),
  refreshToken: createCustomRoute({
    operationId: 'refreshToken',
    method: 'post',
    path: '/refresh-token/{id}',
    guard: isPublicAccess,
    tags: ['auth'],
    summary: 'Token validation and nonce retrieval',
    description:
      'Checks if a token (e.g. for password reset, email verification, or invite) is still valid and returns basic data and a nonce for further actions.',
    request: {
      params: z.object({ id: idSchema }),
      query: z.object({ type: z.enum(appConfig.tokenTypes) }),
    },
    responses: {
      200: {
        description: 'Token is valid',
        content: {
          'application/json': {
            schema: tokenWithDataSchema,
          },
        },
      },
      ...errorResponses,
    },
  }),
  acceptEntityInvite: createCustomRoute({
    operationId: 'acceptEntityInvite',
    method: 'post',
    path: '/accept-invite/{token}',
    guard: [isAuthenticated],
    middleware: [tokenLimiter('invitation'), hasValidToken('invitation')],
    tags: ['auth'],
    summary: 'Accept invitation',
    description: 'Accepts an invitation token and activates the associated membership or system access.',
    request: {
      params: tokenParamSchema,
    },
    responses: {
      200: {
        description: 'Invitation was accepted',
        content: {
          'application/json': {
            schema: entityBaseSchema.extend({
              createdAt: z.string(),
              membership: membershipSummarySchema,
            }),
          },
        },
      },
      ...errorResponses,
    },
  }),
  githubSignIn: createCustomRoute({
    operationId: 'githubSignIn',
    method: 'get',
    path: '/github',
    guard: isPublicAccess,
    tags: ['auth'],
    summary: 'Authenticate with GitHub',
    description:
      'Starts OAuth authentication with GitHub. Supports account connection (`connect`), redirect (`redirect`), or invite token (`token`).',
    security: [],
    request: { query: oauthQuerySchema },
    responses: {
      302: {
        description: 'Redirect to GitHub',
        headers: z.object({ Location: z.string() }),
      },
      ...errorResponses,
    },
  }),
  // TODO - we should rate limit repetitive calls to this endpoint with email as identifier instead of IP
  githubSignInCallback: createCustomRoute({
    operationId: 'githubSignInCallback',
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
        headers: z.object({ Location: z.string() }),
      },
      ...errorResponses,
    },
  }),
  getPasskeyChallenge: createCustomRoute({
    operationId: 'getPasskeyChallenge',
    method: 'get',
    path: '/passkey-challenge',
    guard: isPublicAccess,
    tags: ['auth'],
    summary: 'Get passkey challenge',
    description: 'Initiates the passkey registration or authentication flow by generating a device bound challenge.',
    security: [],
    responses: {
      200: {
        description: 'Challenge created',
        content: {
          'application/json': {
            schema: passkeyChallengeQuerySchema,
          },
        },
      },
      ...errorResponses,
    },
  }),
  googleSignIn: createCustomRoute({
    operationId: 'googleSignIn',
    method: 'get',
    path: '/google',
    guard: isPublicAccess,
    tags: ['auth'],
    summary: 'Authenticate with Google',
    description:
      'Starts OAuth authentication with Google. Supports account connection (`connect`), redirect (`redirect`), or invite token (`token`).',
    security: [],
    request: { query: oauthQuerySchema },
    responses: {
      302: {
        description: 'Redirect to Google',
        headers: z.object({ Location: z.string() }),
      },
      ...errorResponses,
    },
  }),
  googleSignInCallback: createCustomRoute({
    operationId: 'googleSignInCallback',
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
        headers: z.object({ Location: z.string() }),
      },
      ...errorResponses,
    },
  }),
  microsoftSignIn: createCustomRoute({
    operationId: 'microsoftSignIn',
    method: 'get',
    path: '/microsoft',
    guard: isPublicAccess,
    tags: ['auth'],
    summary: 'Authenticate with Microsoft',
    description:
      'Starts OAuth authentication with Microsoft. Supports account connection (`connect`), redirect (`redirect`), or invite token (`token`).',
    security: [],
    request: { query: oauthQuerySchema },
    responses: {
      302: {
        description: 'Redirect to Microsoft',
        headers: z.object({ Location: z.string() }),
      },
      ...errorResponses,
    },
  }),
  microsoftSignInCallback: createCustomRoute({
    operationId: 'microsoftSignInCallback',
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
        headers: z.object({ Location: z.string() }),
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
        content: {
          'application/json': {
            schema: successWithoutDataSchema,
          },
        },
      },
      ...errorResponses,
    },
  }),
};

export default authRoutes;
