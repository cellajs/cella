import { z } from 'zod';
import { createRouteConfig } from '#/lib/route-config';
import { isAuthenticated, isSystemAdmin } from '#/middlewares/guard';
import { errorResponses, successWithDataSchema, successWithErrorsSchema, successWithPaginationSchema } from '#/utils/schema/common-responses';
import { entityParamSchema, idsQuerySchema } from '#/utils/schema/common-schemas';
import { entitySuggestionSchema } from '../general/schema';
import { updateUserBodySchema, userSchema, usersQuerySchema } from './schema';

class UsersRoutesConfig {
  public getUsers = createRouteConfig({
    method: 'get',
    path: '/',
    guard: [isAuthenticated, isSystemAdmin],
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
    guard: [isAuthenticated, isSystemAdmin],
    tags: ['users'],
    summary: 'Delete users',
    description: 'Delete users from system by list of ids.',
    request: {
      query: idsQuerySchema,
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
            schema: successWithDataSchema(z.object({ ...userSchema.shape, organizations: z.array(entitySuggestionSchema) })),
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
export default new UsersRoutesConfig();
