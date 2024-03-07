import { createRoute, z } from '@hono/zod-openapi';

import {
  errorResponses,
  successResponseWithDataSchema,
  successResponseWithErrorsSchema,
  successResponseWithPaginationSchema,
} from '../../lib/common-responses';
import { userMenuSchema } from '../organizations/schema';
import { apiUserSchema, getUserParamSchema, getUsersQuerySchema, updateUserJsonSchema, updateUserParamSchema } from './schema';
import { createRouteConfig } from '../../lib/createRoute';

export const meRouteConfig = createRouteConfig({
  method: 'get',
  path: '/me',
  guard: 'auth',
  tags: ['users'],
  summary: 'Get the current user',
  responses: {
    200: {
      description: 'User',
      content: {
        'application/json': {
          schema: successResponseWithDataSchema(apiUserSchema),
        },
      },
    },
    ...errorResponses,
  },
});

export const getUsersConfig = createRouteConfig({
  method: 'get',
  path: '/users',
  guard: 'system',
  tags: ['users'],
  summary: 'Get users',
  description: `
    Permissions:
      - Users with role 'ADMIN'
  `,
  request: {
    query: getUsersQuerySchema,
  },
  responses: {
    200: {
      description: 'Users',
      content: {
        'application/json': {
          schema: successResponseWithPaginationSchema(apiUserSchema),
        },
      },
    },
    ...errorResponses,
  },
});

export const userSuggestionsConfig = createRouteConfig({
  method: 'get',
  path: '/users/suggestions',
  guard: 'auth',
  tags: ['users'],
  summary: 'Get user suggestions',
  request: {
    query: z.object({
      q: z.string().optional().openapi({ description: 'Search by name or email' }),
    }),
  },
  responses: {
    200: {
      description: 'User suggestions',
      content: {
        'application/json': {
          schema: successResponseWithDataSchema(
            z.array(
              apiUserSchema.pick({
                name: true,
                email: true,
                thumbnailUrl: true,
              }),
            ),
          ),
        },
      },
    },
    ...errorResponses,
  },
});

export const updateUserConfig = createRouteConfig({
  method: 'put',
  path: '/users/{userId}',
  guard: 'auth',
  tags: ['users'],
  summary: 'Update a user',
  description: `
    Permissions:
      - Users with role 'ADMIN'
      - Users, who are the user
  `,
  request: {
    params: updateUserParamSchema,
    body: {
      content: {
        'application/json': {
          schema: updateUserJsonSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'User',
      content: {
        'application/json': {
          schema: successResponseWithDataSchema(apiUserSchema),
        },
      },
    },
    ...errorResponses,
  },
});

export const getUserByIdOrSlugRoute = createRoute({
  method: 'get',
  path: '/users/{userId}',
  tags: ['users'],
  summary: 'Get user by id or slug',
  description: `
    Permissions:
      - Users with role 'ADMIN'
      - Users, who are the user
  `,
  request: {
    params: getUserParamSchema,
  },
  responses: {
    200: {
      description: 'User',
      content: {
        'application/json': {
          schema: successResponseWithDataSchema(apiUserSchema),
        },
      },
    },
    ...errorResponses,
  },
});

export const getUserMenuConfig = createRouteConfig({
  method: 'get',
  path: '/menu',
  guard: 'auth',
  tags: ['users'],
  summary: 'Get the menu of a current user',
  description: `
    Receive all organizations of which the current user is a member.
  `,
  responses: {
    200: {
      description: 'Menu of a user',
      content: {
        'application/json': {
          schema: successResponseWithDataSchema(userMenuSchema),
        },
      },
    },
    ...errorResponses,
  },
});

export const deleteUsersRoute = createRoute({
  method: 'delete',
  path: '/users',
  tags: ['users'],
  summary: 'Delete users',
  request: {
    query: z.object({
      ids: z.union([z.string(), z.array(z.string())]),
    }),
  },
  description: `
    Permissions:
      - Users with role 'ADMIN'
      - Users, who are the user
  `,
  responses: {
    200: {
      description: 'Success',
      content: {
        'application/json': {
          schema: successResponseWithErrorsSchema(),
        },
      },
    },
    ...errorResponses,
  },
});
