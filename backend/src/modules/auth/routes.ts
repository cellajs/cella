import { z } from '@hono/zod-openapi';
import { config } from 'config';
import { createRouteConfig } from '#/lib/route-config';
import { isAuthenticated, isPublicAccess, systemGuard } from '#/middlewares/guard';
import { hasValidToken } from '#/middlewares/has-valid-token';
import { emailEnumLimiter, passwordLimiter, spamLimiter, tokenLimiter } from '#/middlewares/rate-limiter';
import { errorResponses, successWithDataSchema, successWithoutDataSchema } from '#/utils/schema/common-responses';
import { cookieSchema, idSchema, passwordSchema, tokenSchema } from '#/utils/schema/common-schemas';
import {
  checkTokenSchema,
  emailBodySchema,
  emailPasswordBodySchema,
  oauthQuerySchema,
  passkeyChallengeQuerySchema,
  passkeyRegistrationBodySchema,
  passkeyVerificationBodySchema,
  sendVerificationEmailBodySchema,
  signInResponse,
} from './schema';

class AuthLayoutRouteConfig {
  public startImpersonation = createRouteConfig({
    method: 'get',
    path: '/impersonation/start',
    guard: [isAuthenticated, systemGuard],
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
  });

  public stopImpersonation = createRouteConfig({
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
  });

  public checkEmail = createRouteConfig({
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
  });

  public signUp = createRouteConfig({
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
  });

  public signUpWithToken = createRouteConfig({
    method: 'post',
    path: '/sign-up/{token}',
    guard: isPublicAccess,
    middleware: [spamLimiter, emailEnumLimiter, hasValidToken('invitation')],
    tags: ['auth'],
    summary: 'Sign up to accept invite',
    description: 'Sign up with email and password to accept system or organization invitation.',
    security: [],
    request: {
      params: tokenSchema,
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
  });

  public sendVerificationEmail = createRouteConfig({
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
  });

  public verifyEmail = createRouteConfig({
    method: 'post',
    path: '/verify-email/{token}',
    guard: isPublicAccess,
    middleware: [tokenLimiter, hasValidToken('email_verification')],
    tags: ['auth'],
    summary: 'Verify email by token',
    description: 'Verify email address by token from the verification email. Receive a user session when successful.',
    security: [],
    request: {
      params: tokenSchema,
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
  });

  public requestPassword = createRouteConfig({
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
  });

  public createPasswordWithToken = createRouteConfig({
    method: 'post',
    path: '/create-password/{token}',
    guard: isPublicAccess,
    middleware: [tokenLimiter, hasValidToken('password_reset')],
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
  });

  public verifyPasskey = createRouteConfig({
    method: 'post',
    path: '/passkey-verification',
    guard: isPublicAccess,
    middleware: [tokenLimiter],
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
  });

  public signIn = createRouteConfig({
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
        content: {
          'application/json': {
            schema: successWithDataSchema(signInResponse),
          },
        },
      },
      ...errorResponses,
    },
  });

  public checkToken = createRouteConfig({
    method: 'post',
    path: '/check-token/{id}',
    middleware: [tokenLimiter],
    guard: isPublicAccess,
    tags: ['auth'],
    summary: 'Token validation check',
    description:
      'This endpoint is used to check if a token is still valid. It is used to provide direct user feedback on the validity of tokens such as reset password and invitation.',
    request: {
      params: z.object({ id: idSchema }),
      query: z.object({ type: z.enum(config.tokenTypes) }),
    },
    responses: {
      200: {
        description: 'Token is valid',
        content: {
          'application/json': {
            schema: successWithDataSchema(checkTokenSchema),
          },
        },
      },
      ...errorResponses,
    },
  });

  // Info: this route requires authentication
  public acceptOrgInvite = createRouteConfig({
    method: 'post',
    path: '/accept-invite/{token}',
    guard: [isAuthenticated],
    middleware: [tokenLimiter, hasValidToken('invitation')],
    tags: ['auth'],
    summary: 'Accept invitation',
    description: 'Accept invitation token',
    request: {
      params: tokenSchema,
    },
    responses: {
      200: {
        description: 'Invitation was accepted',
        content: {
          'application/json': {
            schema: successWithoutDataSchema,
          },
        },
      },
      ...errorResponses,
    },
  });

  public githubSignIn = createRouteConfig({
    method: 'get',
    path: '/github',
    guard: isPublicAccess,
    tags: ['auth'],
    summary: 'Authenticate with GitHub',
    description:
      'Authenticate with Github to sign in or sign up. A `connect` (userId),`redirect` or `token` query parameter can be used to connect account, redirect to a specific page or to accept invitation.',
    security: [],
    request: {
      query: oauthQuerySchema,
    },
    responses: {
      302: {
        description: 'Redirect to GitHub',
        headers: z.object({ Location: z.string() }),
      },
      ...errorResponses,
    },
  });

  public githubSignInCallback = createRouteConfig({
    method: 'get',
    path: '/github/callback',
    guard: isPublicAccess,
    middleware: [tokenLimiter],
    tags: ['auth'],
    summary: 'Callback for GitHub',
    description: 'Callback to receive authorization and basic user data from Github.',
    security: [],
    request: {
      query: z.object({
        code: z.string().optional(),
        state: z.string(),
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
  });

  public getPasskeyChallenge = createRouteConfig({
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
  });

  public registerPasskey = createRouteConfig({
    method: 'post',
    path: '/passkey-registration',
    guard: isPublicAccess,
    middleware: [tokenLimiter],
    tags: ['auth'],
    summary: 'Register passkey',
    description:
      'The server associates the public key and the credential ID with the user for future authentication flows and checks the validity of the operation by verifying the signed challenge with the public key.',
    security: [],
    request: {
      body: {
        required: true,
        content: {
          'application/json': {
            schema: passkeyRegistrationBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Passkey created',
        content: {
          'application/json': {
            schema: successWithoutDataSchema,
          },
        },
      },
      ...errorResponses,
    },
  });

  public googleSignIn = createRouteConfig({
    method: 'get',
    path: '/google',
    guard: isPublicAccess,
    tags: ['auth'],
    summary: 'Authenticate with Google',
    description:
      'Authenticate with Google to sign in or sign up. A `connect` (userId),`redirect` or `token` query parameter can be used to connect account, redirect to a specific page or to accept invitation.',
    security: [],
    request: {
      query: oauthQuerySchema,
    },
    responses: {
      302: {
        description: 'Redirect to Google',
        headers: z.object({ Location: z.string() }),
      },
      ...errorResponses,
    },
  });

  public googleSignInCallback = createRouteConfig({
    method: 'get',
    path: '/google/callback',
    guard: isPublicAccess,
    middleware: [tokenLimiter],
    tags: ['auth'],
    summary: 'Callback for Google',
    description: 'Callback to receive authorization and basic user data from Google.',
    security: [],
    request: {
      query: z.object({
        code: z.string(),
        state: z.string(),
      }),
    },
    responses: {
      302: {
        description: 'Redirect to frontend',
        headers: z.object({ Location: z.string() }),
      },
      ...errorResponses,
    },
  });

  public microsoftSignIn = createRouteConfig({
    method: 'get',
    path: '/microsoft',
    guard: isPublicAccess,
    tags: ['auth'],
    summary: 'Authenticate with Microsoft',
    description:
      'Authenticate with Microsoft to sign in or sign up.  A `connect` (userId),`redirect` or `token` query parameter can be used to connect account, redirect to a specific page or to accept invitation.',
    security: [],
    request: {
      query: oauthQuerySchema,
    },
    responses: {
      302: {
        description: 'Redirect to Microsoft',
        headers: z.object({ Location: z.string() }),
      },
      ...errorResponses,
    },
  });

  public microsoftSignInCallback = createRouteConfig({
    method: 'get',
    path: '/microsoft/callback',
    guard: isPublicAccess,
    middleware: [tokenLimiter],
    tags: ['auth'],
    summary: 'Callback for Microsoft',
    description: 'Callback to receive authorization and basic user data from Microsoft.',
    security: [],
    request: {
      query: z.object({
        code: z.string(),
        state: z.string(),
      }),
    },
    responses: {
      302: {
        description: 'Redirect to frontend',
        headers: z.object({ Location: z.string() }),
      },
      ...errorResponses,
    },
  });

  public signOut = createRouteConfig({
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
  });
}

export default new AuthLayoutRouteConfig();
