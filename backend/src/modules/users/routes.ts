import { createRouteConfig } from '#/lib/route-config';
import { isAuthenticated, systemGuard } from '#/middlewares/guard';
import { entityParamSchema, idsBodySchema } from '#/utils/schema/common';
import { errorResponses, successWithDataSchema, successWithErrorsSchema, successWithPaginationSchema } from '#/utils/schema/responses';
import { updateUserBodySchema, userSchema, usersQuerySchema } from './schema';

class UserRouteConfig {
  public getUsers = createRouteConfig({
    method: 'get',
    path: '/',
    guard: [isAuthenticated, systemGuard],
    tags: ['users'],
    summary: 'Get list of users',
    description: 'Get a list of users on system level.',
    request: {
      query: usersQuerySchema,
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
  });

  public deleteUsers = createRouteConfig({
    method: 'delete',
    path: '/',
    guard: [isAuthenticated, systemGuard],
    tags: ['users'],
    summary: 'Delete users',
    description: 'Delete users from system by list of ids.',
    request: {
      body: {
        content: { 'application/json': { schema: idsBodySchema } },
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
  });

  public getUser = createRouteConfig({
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
  });

  public updateUser = createRouteConfig({
    method: 'put',
    path: '/{idOrSlug}',
    guard: [isAuthenticated, systemGuard],
    tags: ['users'],
    summary: 'Update user',
    description: 'Update a user by id or slug.',
    request: {
      params: entityParamSchema,
      body: {
        content: {
          'application/json': {
            schema: updateUserBodySchema,
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
  });
}
export default new UserRouteConfig();
