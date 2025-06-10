import { createCustomRoute } from '#/lib/custom-routes';
import { hasSystemAccess, isAuthenticated } from '#/middlewares/guard';
import { userListQuerySchema, userSchema, userUpdateBodySchema } from '#/modules/users/schema';
import { entityParamSchema, idsBodySchema } from '#/utils/schema/common';
import { errorResponses, successWithDataSchema, successWithErrorsSchema, successWithPaginationSchema } from '#/utils/schema/responses';

const userRoutes = {
  getUsers: createCustomRoute({
    method: 'get',
    path: '/',
    guard: [isAuthenticated, hasSystemAccess],
    tags: ['users'],
    summary: 'Get list of users',
    description: 'Get a list of users on system level.',
    request: {
      query: userListQuerySchema,
    },
    responses: {
      200: {
        description: 'Users',
        content: {
          'application/json': {
            schema: successWithPaginationSchema(userSchema),
          },
        },
      },
      ...errorResponses,
    },
  }),
  deleteUsers: createCustomRoute({
    method: 'delete',
    path: '/',
    guard: [isAuthenticated, hasSystemAccess],
    tags: ['users'],
    summary: 'Delete users',
    description: 'Delete users from system by list of ids.',
    request: {
      body: {
        content: { 'application/json': { schema: idsBodySchema() } },
      },
    },
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: successWithErrorsSchema(),
          },
        },
      },
      ...errorResponses,
    },
  }),
  getUser: createCustomRoute({
    method: 'get',
    path: '/{idOrSlug}',
    guard: isAuthenticated,
    tags: ['users'],
    summary: 'Get user',
    description: 'Get a user by id or slug.',
    request: {
      params: entityParamSchema,
    },
    responses: {
      200: {
        description: 'User',
        content: {
          'application/json': {
            schema: successWithDataSchema(userSchema),
          },
        },
      },
      ...errorResponses,
    },
  }),
  updateUser: createCustomRoute({
    method: 'put',
    path: '/{idOrSlug}',
    guard: [isAuthenticated, hasSystemAccess],
    tags: ['users'],
    summary: 'Update user',
    description: 'Update a user by id or slug.',
    request: {
      params: entityParamSchema,
      body: {
        content: {
          'application/json': {
            schema: userUpdateBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'User',
        content: {
          'application/json': {
            schema: successWithDataSchema(userSchema),
          },
        },
      },
      ...errorResponses,
    },
  }),
};
export default userRoutes;
