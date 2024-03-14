import { z } from '@hono/zod-openapi';

import { errorResponses, successResponseWithDataSchema, successResponseWithoutDataSchema } from '../../lib/common-responses';
import { cookieSchema } from '../../lib/common-schemas';
import { createRoute } from '../../lib/route-config';
import { publicGuard } from '../../middlewares/guard';
import { rateLimiter } from '../../middlewares/rate-limiter';
import { signInRateLimiter } from '../../middlewares/rate-limiter/sign-in';
import { apiUserSchema } from '../users/schema';
import {
  acceptInviteJsonSchema,
  checkEmailJsonSchema,
  emailExistsJsonSchema,
  resetPasswordJsonSchema,
  signInJsonSchema,
  signUpJsonSchema,
} from './schema';
import { CustomHono } from '../../types/common';

export const app = new CustomHono();

const authRateLimiter = rateLimiter({ points: 5, duration: 60 * 60, blockDuration: 60 * 10, keyPrefix: 'auth_fail' }, 'fail');

export const signUpRoute = createRoute(app, {
  method: 'post',
  path: '/sign-up',
  guard: publicGuard,
  tags: ['auth'],
  summary: 'Sign up a new user',
  security: [],
  request: {
    body: {
      content: {
        'application/json': {
          schema: signUpJsonSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'User signed up successfully (cookie set automatically)',
      headers: z.object({
        'Set-Cookie': cookieSchema,
      }),
      content: {
        'application/json': {
          schema: successResponseWithoutDataSchema,
        },
      },
    },
    ...errorResponses,
  },
});

export const verifyEmailRoute = createRoute(app, {
  method: 'get',
  path: '/verify-email/{token}',
  guard: publicGuard,
  middlewares: [authRateLimiter],
  tags: ['auth'],
  summary: 'Verify a user email address',
  security: [],
  request: {
    query: z.object({
      resend: z.string().optional(),
    }),
    params: z.object({
      token: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Email address verified',
      content: {
        'application/json': {
          schema: successResponseWithoutDataSchema,
        },
      },
    },
    ...errorResponses,
  },
});

export const sendVerificationEmailRoute = createRoute(app, {
  method: 'post',
  path: '/send-verification-email',
  guard: publicGuard,
  middlewares: [authRateLimiter],
  tags: ['auth'],
  summary: 'Resend a verification email',
  security: [],
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            email: z.string(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Verification email sent',
      content: {
        'application/json': {
          schema: successResponseWithoutDataSchema,
        },
      },
    },
    ...errorResponses,
  },
});

export const resetPasswordRoute = createRoute(app, {
  method: 'post',
  path: '/reset-password',
  guard: publicGuard,
  middlewares: [authRateLimiter],
  tags: ['auth'],
  summary: 'Request a reset password email',
  security: [],
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            email: z.string(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Password reset email sent',
      content: {
        'application/json': {
          schema: successResponseWithoutDataSchema,
        },
      },
    },
    ...errorResponses,
  },
});

export const resetPasswordCallbackRoute = createRoute(app, {
  method: 'post',
  path: '/reset-password/{token}',
  guard: publicGuard,
  middlewares: [authRateLimiter],
  tags: ['auth'],
  summary: 'Submit a new password',
  security: [],
  request: {
    params: z.object({
      token: z.string(),
    }),
    body: {
      content: {
        'application/json': {
          schema: resetPasswordJsonSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Password reset successfully',
      content: {
        'application/json': {
          schema: successResponseWithoutDataSchema,
        },
      },
    },
    ...errorResponses,
  },
});

export const checkEmailRoute = createRoute(app, {
  method: 'post',
  path: '/check-email',
  guard: publicGuard,
  middlewares: [authRateLimiter],
  tags: ['auth'],
  summary: 'Check if an email address exists',
  security: [],
  request: {
    body: {
      content: {
        'application/json': {
          schema: checkEmailJsonSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'User email address exists or not',
      content: {
        'application/json': {
          schema: successResponseWithDataSchema(emailExistsJsonSchema),
        },
      },
    },
    ...errorResponses,
  },
});

export const signInRoute = createRoute(app, {
  method: 'post',
  path: '/sign-in',
  guard: publicGuard,
  middlewares: [signInRateLimiter()],
  tags: ['auth'],
  summary: 'Sign in a user',
  security: [],
  request: {
    body: {
      content: {
        'application/json': {
          schema: signInJsonSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'User signed in successfully (cookie set automatically)',
      headers: z.object({
        'Set-Cookie': cookieSchema,
      }),
      content: {
        'application/json': {
          schema: successResponseWithDataSchema(apiUserSchema),
        },
      },
    },
    302: {
      description: 'Email address not verified',
      headers: z.object({
        Location: z.string(),
      }),
    },
    ...errorResponses,
  },
});

export const signOutRoute = createRoute(app, {
  method: 'get',
  path: '/sign-out',
  guard: publicGuard,
  tags: ['auth'],
  summary: 'Sign out a user',
  responses: {
    200: {
      description: 'User signed out',
      content: {
        'application/json': {
          schema: successResponseWithoutDataSchema,
        },
      },
    },
    ...errorResponses,
  },
});

export const acceptInviteRoute = createRoute(app, {
  method: 'post',
  path: '/accept-invite/{token}',
  guard: publicGuard,
  middlewares: [authRateLimiter],
  tags: ['auth'],
  summary: 'Accept invitation',
  request: {
    params: z.object({
      token: z.string(),
    }),
    body: {
      content: {
        'application/json': {
          schema: acceptInviteJsonSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Invitation was accepted',
      content: {
        'application/json': {
          schema: successResponseWithDataSchema(z.string()),
        },
      },
    },
    302: {
      description: 'Redirect to github',
      headers: z.object({
        Location: z.string(),
      }),
    },
    ...errorResponses,
  },
});
