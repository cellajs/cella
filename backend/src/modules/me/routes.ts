import { createRouteConfig } from '#/lib/route-config';
import { isAuthenticated } from '#/middlewares/guard';
import { errorResponses, successWithDataSchema, successWithErrorsSchema, successWithoutDataSchema } from '#/utils/schema/common-responses';
import { idsQuerySchema } from '#/utils/schema/common-schemas';
import { updateUserBodySchema, userSchema } from '../users/schema';
import { meUserSchema, signUpInfo, userMenuSchema } from './schema';

class MeRoutesConfig {
  public getSelf = createRouteConfig({
    method: 'get',
    path: '/',
    guard: isAuthenticated,
    tags: ['me'],
    summary: 'Get self',
    description: 'Get the current user (self). It includes a `counts` object and a list of `sessions`.',
    responses: {
      200: {
        description: 'User',
        content: {
          'application/json': {
            schema: successWithDataSchema(meUserSchema),
          },
        },
      },
      ...errorResponses,
    },
  });

  public updateSelf = createRouteConfig({
    method: 'put',
    path: '/',
    guard: isAuthenticated,
    tags: ['me'],
    summary: 'Update self',
    description: 'Update the current user (self).',
    request: {
      body: {
        content: {
          'application/json': {
            schema: updateUserBodySchema.omit({
              role: true,
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'User',
        content: {
          'application/json': {
            schema: successWithDataSchema(userSchema.extend(signUpInfo.shape)),
          },
        },
      },
      ...errorResponses,
    },
  });

  public deleteSelf = createRouteConfig({
    method: 'delete',
    path: '/',
    guard: isAuthenticated,
    tags: ['me'],
    summary: 'Delete self',
    description: 'Delete the current user (self).',
    responses: {
      200: {
        description: 'User deleted',
        content: {
          'application/json': {
            schema: successWithoutDataSchema,
          },
        },
      },
      ...errorResponses,
    },
  });

  public getUserMenu = createRouteConfig({
    method: 'get',
    path: '/menu',
    guard: isAuthenticated,
    tags: ['me'],
    summary: 'Get menu of self',
    description:
      'Receive menu data with all contextual entities of which the current user is a member. It is in essence a restructured list of `memberships` per entity type, with some entity data in it.',
    responses: {
      200: {
        description: 'Menu of user',
        content: {
          'application/json': {
            schema: successWithDataSchema(userMenuSchema),
          },
        },
      },
      ...errorResponses,
    },
  });

  public deleteSessions = createRouteConfig({
    method: 'delete',
    path: '/sessions',
    guard: isAuthenticated,
    tags: ['me'],
    summary: 'Terminate sessions',
    description: 'Terminate all sessions of the current user, except for current session.',
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
  public deletePasskey = createRouteConfig({
    method: 'delete',
    path: '/passkey',
    guard: isAuthenticated,
    tags: ['me'],
    summary: 'Delete passkey of self',
    description: 'Delete your passkey record.',
    security: [],
    responses: {
      200: {
        description: 'Passkey removed',
        content: {
          'application/json': {
            schema: successWithoutDataSchema,
          },
        },
      },
      ...errorResponses,
    },
  });
}
export default new MeRoutesConfig();
