import { z } from '@hono/zod-openapi';

import {
  errorResponses,
  successResponseWithDataSchema,
  successResponseWithErrorsSchema,
  successResponseWithPaginationSchema,
} from '../../lib/common-responses';
import { deleteByIdsQuerySchema } from '../../lib/common-schemas';
import { createRouteConfig } from '../../lib/route-config';
import { authGuard, systemGuard } from '../../middlewares/guard';
import { userMenuSchema, apiUserSchema, getUserParamSchema, getUsersQuerySchema, updateUserJsonSchema, updateUserParamSchema } from './schema';

export const meRouteConfig = createRouteConfig({
  method: 'get',
  path: '/me',
  guard: authGuard(),
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

export const getUserSessionsConfig = createRouteConfig({
  method: 'get',
  path: '/me/sessions',
  guard: authGuard(),
  tags: ['users'],
  summary: 'Get the sessions of the current user',
  responses: {
    200: {
      description: 'Sessions',
      content: {
        'application/json': {
          schema: successResponseWithDataSchema(
            z
              .object({
                id: z.string(),
                expiresAt: z.string(),
              })
              .array(),
          ),
        },
      },
    },
    ...errorResponses,
  },
});

export const getUsersConfig = createRouteConfig({
  method: 'get',
  path: '/users',
  guard: systemGuard,
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

export const updateUserConfig = createRouteConfig({
  method: 'put',
  path: '/users/{userId}',
  guard: authGuard(),
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

export const getUserByIdOrSlugRouteConfig = createRouteConfig({
  method: 'get',
  path: '/users/{userIdentifier}',
  guard: authGuard(),
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
  guard: authGuard(),
  tags: ['users'],
  summary: 'Get the menu of a current user',
  description: `
    Receive all resources of which the current user is a member.
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

export const deleteUsersRouteConfig = createRouteConfig({
  method: 'delete',
  path: '/users',
  guard: authGuard(),
  tags: ['users'],
  summary: 'Delete users',
  request: {
    query: deleteByIdsQuerySchema,
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

export const terminateSessionsConfig = createRouteConfig({
  method: 'delete',
  path: '/me/sessions',
  guard: authGuard(),
  tags: ['users'],
  summary: 'Terminate sessions',
  request: {
    query: deleteByIdsQuerySchema,
  },
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
