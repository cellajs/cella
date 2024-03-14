import { z } from '@hono/zod-openapi';

import { errorResponses, successResponseWithoutDataSchema } from '../../lib/common-responses';
import { createRoute } from '../../lib/route-config';
import { publicGuard } from '../../middlewares/guard';
import { CustomHono } from '../../types/common';

export const app = new CustomHono();

export const githubSignInRoute = createRoute(app, {
  method: 'get',
  path: '/sign-in/github',
  guard: publicGuard,
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

export const githubSignInCallbackRoute = createRoute(app, {
  method: 'get',
  path: '/sign-in/github/callback',
  guard: publicGuard,
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

export const googleSignInRoute = createRoute(app, {
  method: 'get',
  path: '/sign-in/google',
  guard: publicGuard,
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

export const googleSignInCallbackRoute = createRoute(app, {
  method: 'get',
  path: '/sign-in/google/callback',
  guard: publicGuard,
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

export const microsoftSignInRoute = createRoute(app, {
  method: 'get',
  path: '/sign-in/microsoft',
  guard: publicGuard,
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

export const microsoftSignInCallbackRoute = createRoute(app, {
  method: 'get',
  path: '/sign-in/microsoft/callback',
  guard: publicGuard,
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

