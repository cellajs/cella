import { createRoute, z } from '@hono/zod-openapi';

import { cookieSchema, successResponseWithDataSchema, successResponseWithoutDataSchema } from '../../schemas/common';
import { errorResponses } from '../../schemas/responses';
import {
  apiUserSchema,
  checkEmailJsonSchema,
  emailExistsJsonSchema,
  resetPasswordJsonSchema,
  signInJsonSchema,
  signUpJsonSchema,
} from '../../schemas/user';

export const signUpRoute = createRoute({
  method: 'post',
  path: '/sign-up',
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
          schema: successResponseWithDataSchema(apiUserSchema),
        },
      },
    },
    ...errorResponses,
  },
});

export const verifyEmailRoute = createRoute({
  method: 'get',
  path: '/verify-email/{token}',
  tags: ['auth'],
  summary: 'Verify a user email address',
  security: [],
  request: {
    params: z.object({
      token: z.string(),
    }),
  },
  responses: {
    302: {
      description: 'Email address verified',
      headers: z.object({
        Location: z.string(),
      }),
    },
    ...errorResponses,
  },
});

export const sendVerificationEmailRoute = createRoute({
  method: 'post',
  path: '/send-verification-email',
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

export const resetPasswordRoute = createRoute({
  method: 'post',
  path: '/reset-password',
  tags: ['auth'],
  summary: 'Reset a user password',
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

export const resetPasswordCallbackRoute = createRoute({
  method: 'post',
  path: '/reset-password/{token}',
  tags: ['auth'],
  summary: 'Callback for password reset',
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

export const checkEmailRoute = createRoute({
  method: 'post',
  path: '/check-email',
  tags: ['auth'],
  summary: 'Check if an email address exists for a user',
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

export const signInRoute = createRoute({
  method: 'post',
  path: '/sign-in',
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

export const githubSignInRoute = createRoute({
  method: 'get',
  path: '/sign-in/github',
  tags: ['auth'],
  summary: 'Sign in a user with GitHub',
  security: [],
  request: {
    query: z.object({
      redirect: z.string().optional(),
    }),
  },
  responses: {
    302: {
      description: 'Redirect to GitHub',
      headers: z.object({
        Location: z.string(),
      }),
    },
    ...errorResponses,
  },
});

export const githubSignInCallbackRoute = createRoute({
  method: 'get',
  path: '/sign-in/github/callback',
  tags: ['auth'],
  summary: 'Callback for GitHub sign in',
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

export const googleSignInRoute = createRoute({
  method: 'get',
  path: '/sign-in/google',
  tags: ['auth'],
  summary: 'Sign in a user with Google',
  security: [],
  request: {
    query: z.object({
      redirect: z.string().optional(),
    }),
  },
  responses: {
    302: {
      description: 'Redirect to Google',
      headers: z.object({
        Location: z.string(),
      }),
    },
    ...errorResponses,
  },
});

export const googleSignInCallbackRoute = createRoute({
  method: 'get',
  path: '/sign-in/google/callback',
  tags: ['auth'],
  summary: 'Callback for Google sign in',
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

export const microsoftSignInRoute = createRoute({
  method: 'get',
  path: '/sign-in/microsoft',
  tags: ['auth'],
  summary: 'Sign in a user with Microsoft',
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

export const microsoftSignInCallbackRoute = createRoute({
  method: 'get',
  path: '/sign-in/microsoft/callback',
  tags: ['auth'],
  summary: 'Callback for Microsoft sign in',
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

export const signOutRoute = createRoute({
  method: 'get',
  path: '/sign-out',
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
