import {
  errorResponses,
  successResponseWithDataSchema,
  successResponseWithErrorsSchema,
  successResponseWithPaginationSchema,
} from '../../lib/common-responses';
import { deleteByIdsQuerySchema, userParamSchema } from '../../lib/common-schemas';
import { createRouteConfig } from '../../lib/route-config';
import { isAuthenticated, isSystemAdmin } from '../../middlewares/guard';
import { apiUserSchema, getUsersQuerySchema, updateUserJsonSchema } from './schema';

export const getUsersConfig = createRouteConfig({
  method: 'get',
  path: '/',
  guard: [isAuthenticated, isSystemAdmin],
  tags: ['users'],
  summary: 'Get list of users',
  description: 'Get a list of users on system level.',
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

export const deleteUsersRouteConfig = createRouteConfig({
  method: 'delete',
  path: '/',
  guard: [isAuthenticated, isSystemAdmin],
  tags: ['users'],
  summary: 'Delete users',
  description: 'Delete users from system by list of ids.',
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

export const getUserRouteConfig = createRouteConfig({
  method: 'get',
  path: '/{user}',
  guard: isAuthenticated,
  tags: ['users'],
  summary: 'Get user',
  description: 'Get a user by id or slug.',
  request: {
    params: userParamSchema,
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

export const updateUserConfig = createRouteConfig({
  method: 'put',
  path: '/{user}',
  guard: [isAuthenticated, isSystemAdmin],
  tags: ['users'],
  summary: 'Update user',
  description: 'Update a user by id or slug.',
  request: {
    params: userParamSchema,
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
