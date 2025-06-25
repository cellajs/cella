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
  sendVerificationEmailBodySchema,
  tokenWithDataSchema
} from '#/modules/auth/schema';
import { cookieSchema, idSchema, passwordSchema, tokenParamSchema } from '#/utils/schema/common';
import { errorResponses, successWithoutDataSchema } from '#/utils/schema/responses';
import { z } from '@hono/zod-openapi';
import { config } from 'config';
import { entityBaseSchema } from '../entities/schema';
import { membershipSummarySchema } from '../memberships/schema';

const authRoutes = {
  startImpersonation: createCustomRoute({
    operationId: 'startImpersonation',
    method: 'get',
    path: '/impersonation/start',
    guard: [isAuthenticated, hasSystemAccess],
    tags: ['auth'],
    summary: 'Start impersonating',
    description: 'System admin impersonates a selected user by id by receiving a special impersonation session.',
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
    description: 'Stop impersonating by clearing impersonation session.',
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
    description: 'Check if user with email address exists.',
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
    description: 'Sign up with email and password. User will receive a verification email.',
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
    description: 'Sign up with email and password to accept system or organization invitation.',
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
  sendVerificationEmail: createCustomRoute({
    operationId: 'sendVerificationEmail',
    method: 'post',
    path: '/send-verification-email',
    guard: isPublicAccess,
    middleware: [spamLimiter],
    tags: ['auth'],
    summary: 'Resend verification email',
    description: 'Resend verification email to user based on token id.',
    security: [],
    request: {
      body: {
        content: {
          'application/json': {
            schema: sendVerificationEmailBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Verification email sent',
        content: {
          'application/json': {
            schema: successWithoutDataSchema,
          },
        },
      },
      ...errorResponses,
    },
  }),
  verifyEmail: createCustomRoute({
    operationId: 'verifyEmail',
    method: 'post',
    path: '/verify-email/{token}',
    guard: isPublicAccess,
    middleware: [tokenLimiter('email_verification'), hasValidToken('email_verification')],
    tags: ['auth'],
    summary: 'Verify email by token',
    description: 'Verify email address by token from the verification email. Receive a user session when successful.',
    security: [],
    request: {
      params: tokenParamSchema,
    },
    responses: {
      200: {
        description: 'Verified & session given',
        content: {
          'application/json': {
            schema: successWithoutDataSchema,
          },
        },
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
    description: 'An email will be sent with a link to create a password.',
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
    operationId: 'createPasswordWithToken',
    method: 'post',
    path: '/create-password/{token}',
    guard: isPublicAccess,
    middleware: [tokenLimiter('password_reset'), hasValidToken('password_reset')],
    tags: ['auth'],
    summary: 'Create password by token',
    description: 'Submit new password and directly receive a user session.',
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
    operationId: 'verifyPasskey',
    method: 'post',
    path: '/passkey-verification',
    guard: isPublicAccess,
    middleware: [tokenLimiter('passkey')],
    tags: ['auth'],
    summary: 'Verify passkey',
    description: 'Verify passkey by checking the validity of signature with public key.',
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
    description: 'Sign in with email and password.',
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
  checkToken: createCustomRoute({
    operationId: 'checkToken',
    method: 'post',
    path: '/check-token/{id}',
    guard: isPublicAccess,
    tags: ['auth'],
    summary: 'Token validation check',
    description:
      'This endpoint is used to check if a token is still valid. It is used to provide direct user feedback on tokens such as reset password and invitation.',
    request: {
      params: z.object({ id: idSchema }),
      query: z.object({ type: z.enum(config.tokenTypes) }),
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
    description: 'Accept invitation token',
    request: {
      params: tokenParamSchema,
    },
    responses: {
      200: {
        description: 'Invitation was accepted',
        content: {
          'application/json': {
            schema: 
              entityBaseSchema.extend({
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
      'Authenticate with Github to sign in or sign up. A `connect` (userId),`redirect` or `token` query parameter can be used to connect account, redirect to a specific page or to accept invitation.',
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
  githubSignInCallback: createCustomRoute({
    operationId: 'githubSignInCallback',
    method: 'get',
    path: '/github/callback',
    guard: isPublicAccess,
    middleware: [tokenLimiter('github')],
    tags: ['auth'],
    summary: 'Callback for GitHub',
    description: 'Callback to receive authorization and basic user data from Github.',
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
    description: 'Handing over the challenge: this results in a key pair, private and public key being created on the device.',
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
      'Authenticate with Google to sign in or sign up. A `connect` (userId),`redirect` or `token` query parameter can be used to connect account, redirect to a specific page or to accept invitation.',
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
    description: 'Callback to receive authorization and basic user data from Google.',
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
      'Authenticate with Microsoft to sign in or sign up.  A `connect` (userId),`redirect` or `token` query parameter can be used to connect account, redirect to a specific page or to accept invitation.',
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
    description: 'Callback to receive authorization and basic user data from Microsoft.',
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
    description: 'Sign out yourself and clear session.',
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
