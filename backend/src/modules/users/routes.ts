import {
  errorResponses,
  successResponseWithDataSchema,
  successResponseWithErrorsSchema,
  successResponseWithPaginationSchema,
} from '../../lib/common-responses';
import { deleteByIdsQuerySchema, entityParamSchema } from '../../lib/common-schemas';
import { createRouteConfig } from '../../lib/route-config';
import { isAuthenticated, isSystemAdmin } from '../../middlewares/guard';
import { apiUserSchema, getUsersQuerySchema, updateUserJsonSchema } from './schema';

class UsersRoutesConfig {
  public getUsers = createRouteConfig({
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

  public deleteUsers = createRouteConfig({
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
            schema: successResponseWithDataSchema(apiUserSchema),
          },
        },
      },
      ...errorResponses,
    },
  });

  public updateUser = createRouteConfig({
    method: 'put',
    path: '/{idOrSlug}',
    guard: [isAuthenticated, isSystemAdmin],
    tags: ['users'],
    summary: 'Update user',
    description: 'Update a user by id or slug.',
    request: {
      params: entityParamSchema,
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
}
export default new UsersRoutesConfig();
