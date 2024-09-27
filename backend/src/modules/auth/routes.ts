import { z } from '@hono/zod-openapi';

import { createRouteConfig } from '#/lib/route-config';
import { isAuthenticated, isPublicAccess, isSystemAdmin } from '#/middlewares/guard';
import { authRateLimiter } from '#/middlewares/rate-limiter';
import { signInRateLimiter } from '#/middlewares/rate-limiter/sign-in';
import { errorResponses, successWithDataSchema, successWithoutDataSchema } from '#/utils/schema/common-responses';
import { cookieSchema, passwordSchema } from '#/utils/schema/common-schemas';
import { authBodySchema, emailBodySchema, passkeyChallengeQuerySchema, passkeyCreationBodySchema, passkeyVerificationBodySchema } from './schema';

class AuthRoutesConfig {
  public impersonationSignIn = createRouteConfig({
    method: 'get',
    path: '/impersonation/start',
    guard: [isAuthenticated, isSystemAdmin],
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

  public impersonationSignOut = createRouteConfig({
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
    middleware: [authRateLimiter],
    tags: ['auth'],
    summary: 'Check if email exists',
    description: 'Check if user with email address exists and whether user has a passkey.',
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
            schema: successWithDataSchema(z.object({ hasPasskey: z.boolean() })),
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
    tags: ['auth'],
    summary: 'Sign up with password',
    description: 'Sign up with email and password. User will receive a verification email.',
    middleware: [authRateLimiter],
    security: [],
    request: {
      body: {
        content: {
          'application/json': {
            schema: authBodySchema,
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
      ...errorResponses,
    },
  });

  public sendVerificationEmail = createRouteConfig({
    method: 'post',
    path: '/send-verification-email',
    guard: isPublicAccess,
    middleware: [authRateLimiter],
    tags: ['auth'],
    summary: 'Resend verification email',
    description: 'Resend verification email to user based on email address.',
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
    path: '/verify-email',
    guard: isPublicAccess,
    middleware: [authRateLimiter],
    tags: ['auth'],
    summary: 'Verify email by token',
    description: 'Verify email address by token from the verification email. Receive a user session when successful.',
    security: [],
    request: {
      query: z.object({
        resend: z.string().optional(),
      }),
      body: {
        content: {
          'application/json': {
            schema: z.object({
              token: z.string(),
            }),
          },
        },
      },
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

  public resetPassword = createRouteConfig({
    method: 'post',
    path: '/reset-password',
    guard: isPublicAccess,
    middleware: [authRateLimiter],
    tags: ['auth'],
    summary: 'Request reset password',
    description: 'An email will be sent with a link to reset password.',
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

  public resetPasswordCallback = createRouteConfig({
    method: 'post',
    path: '/reset-password/{token}',
    guard: isPublicAccess,
    middleware: [authRateLimiter],
    tags: ['auth'],
    summary: 'Submit password by token',
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
        description: 'Password reset successfully',
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
    guard: [isPublicAccess],
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
    guard: [isPublicAccess],
    middleware: [signInRateLimiter()],
    tags: ['auth'],
    summary: 'Sign in with password',
    description: 'Sign in with email and password.',
    security: [],
    request: {
      body: {
        content: {
          'application/json': {
            schema: authBodySchema,
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
            schema: successWithoutDataSchema,
          },
        },
      },
      302: {
        description: 'Email address not verified',
        headers: z.object({ Location: z.string() }),
      },
      ...errorResponses,
    },
  });

  public githubSignIn = createRouteConfig({
    method: 'get',
    path: '/github',
    guard: [isPublicAccess],
    tags: ['auth'],
    summary: 'Authenticate with GitHub',
    description: 'Authenticate with Github to sign in or sign up.',
    security: [],
    request: {
      query: z.object({ redirect: z.string().optional() }),
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
    guard: [isPublicAccess],
    middleware: [authRateLimiter],
    tags: ['auth'],
    summary: 'Callback for GitHub',
    description: 'Callback to receive authorization and basic user data from Github.',
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
        headers: z.object({
          Location: z.string(),
        }),
      },
      ...errorResponses,
    },
  });

  public getPasskeyChallenge = createRouteConfig({
    method: 'get',
    path: '/passkey-challenge',
    guard: [isPublicAccess],
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

  public setPasskey = createRouteConfig({
    method: 'post',
    path: '/passkey-registration',
    guard: [isPublicAccess],
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
            schema: passkeyCreationBodySchema,
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
    guard: [isPublicAccess],
    tags: ['auth'],
    summary: 'Authenticate with Google',
    description: 'Authenticate with Google to sign in or sign up.',
    security: [],
    request: {
      query: z.object({ redirect: z.string().optional() }),
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
    guard: [isPublicAccess],
    middleware: [authRateLimiter],
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
        headers: z.object({
          Location: z.string(),
        }),
      },
      ...errorResponses,
    },
  });

  public microsoftSignIn = createRouteConfig({
    method: 'get',
    path: '/microsoft',
    guard: [isPublicAccess],
    tags: ['auth'],
    summary: 'Authenticate with Microsoft',
    description: 'Authenticate with Microsoft to sign in or sign up.',
    security: [],
    request: {
      query: z.object({
        redirect: z.string().optional(),
      }),
    },
    responses: {
      302: {
        description: 'Redirect to Microsoft',
        headers: z.object({
          Location: z.string(),
        }),
      },
      ...errorResponses,
    },
  });

  public microsoftSignInCallback = createRouteConfig({
    method: 'get',
    path: '/microsoft/callback',
    guard: [isPublicAccess],
    middleware: [authRateLimiter],
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
        headers: z.object({
          Location: z.string(),
        }),
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

export default new AuthRoutesConfig();
