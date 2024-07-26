import { z } from '@hono/zod-openapi';

import { errorResponses, successWithDataSchema, successWithoutDataSchema } from '../../lib/common-responses';
import { cookieSchema, passwordSchema } from '../../lib/common-schemas';
import { createRouteConfig } from '../../lib/route-config';
import { isPublicAccess } from '../../middlewares/guard';
import { authRateLimiter } from '../../middlewares/rate-limiter';
import { signInRateLimiter } from '../../middlewares/rate-limiter/sign-in';
import { userSchema } from '../users/schema';
import { authBodySchema, emailBodySchema } from './schema';

class AuthRoutesConfig {
  public checkEmail = createRouteConfig({
    method: 'post',
    path: '/check-email',
    guard: isPublicAccess,
    middleware: [authRateLimiter],
    tags: ['auth'],
    summary: 'Check if email exists',
    description: 'Check if email address exists in the database.',
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

  public getUserHavePasskey = createRouteConfig({
    method: 'get',
    path: '/passkey/{email}',
    guard: isPublicAccess,
    tags: ['auth'],
    summary: 'Get if user have an passkey sign in option',
    description: 'Check if the user have an passkey sign in option',
    request: {
      params: z.object({ email: z.string() }),
    },
    responses: {
      200: {
        description: 'Passkey state of user',
        content: {
          'application/json': {
            schema: successWithoutDataSchema,
          },
        },
      },
      ...errorResponses,
    },
  });

  // public verifyPasskey = createRouteConfig({
  //   method: 'post',
  //   path: '/verify-passkey',
  //   guard: isPublicAccess,
  //   tags: ['auth'],
  //   summary: 'Verify users passkey',
  //   description: 'Verify users passkey',
  //   request: {
  //     body: {
  //       content: {
  //         'application/json': {
  //           schema: z.object({
  //             credentialId: z.string(),
  //             clientDataJSON: z.string(),
  //             authenticatorData: z.string(),
  //             signature: z.string(),
  //             email: z.string(),
  //           }),
  //         },
  //       },
  //     },
  //   },
  //   responses: {
  //     200: {
  //       description: 'Verify users passkey',
  //       content: {
  //         'application/json': {
  //           schema: successWithDataSchema(userSchema),
  //         },
  //       },
  //     },
  //     ...errorResponses,
  //   },
  // });

  public signIn = createRouteConfig({
    method: 'post',
    path: '/sign-in',
    guard: isPublicAccess,
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
            schema: successWithDataSchema(userSchema),
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
    guard: isPublicAccess,
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
    guard: isPublicAccess,
    middleware: [authRateLimiter],
    tags: ['auth'],
    summary: 'Callback for GitHub',
    description: 'Callback to receive authorization and basic user data.',
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
    guard: isPublicAccess,
    tags: ['auth'],
    summary: 'Get challenge for passkey',
    description: 'Challenge for passkey auth.',
    security: [],
    request: {
      query: z.object({ userId: z.string() }),
    },
    responses: {
      200: {
        description: 'Challenge created',
        content: {
          'application/json': {
            schema: z.object({ challengeBase64: z.string() }),
          },
        },
      },
      ...errorResponses,
    },
  });

  public setPasskey = createRouteConfig({
    method: 'post',
    path: '/passkey-registration',
    guard: isPublicAccess,
    tags: ['auth'],
    summary: 'Get challenge for passkey',
    description: 'Challenge for passkey auth.',
    security: [],
    request: {
      body: {
        required: true,
        content: {
          'application/json': {
            schema: z.object({
              id: z.string(),
              clientDataJSON: z.string(),
              attestationObject: z.string(),
            }),
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
    guard: isPublicAccess,
    middleware: [authRateLimiter],
    tags: ['auth'],
    summary: 'Callback for Google',
    description: 'Callback to receive authorization and basic user data.',
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
    guard: isPublicAccess,
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
    guard: isPublicAccess,
    middleware: [authRateLimiter],
    tags: ['auth'],
    summary: 'Callback for Microsoft',
    description: 'Callback to receive authorization and basic user data.',
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
