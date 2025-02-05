import { createRouteConfig } from '#/lib/route-config';
import { isAuthenticated } from '#/middlewares/guard';
import { errorResponses, successWithDataSchema, successWithErrorsSchema, successWithoutDataSchema } from '#/utils/schema/common-responses';
import { idsBodySchema } from '#/utils/schema/common-schemas';
import { updateUserBodySchema, userSchema } from '../users/schema';
import { leaveEntityQuerySchema, meAuthInfoSchema, userMenuSchema } from './schema';

class MeRoutesConfig {
  public getSelf = createRouteConfig({
    method: 'get',
    path: '/',
    guard: isAuthenticated,
    tags: ['me'],
    summary: 'Get self',
    description: 'Get the current user (self). It includes a `counts` object.',
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

  public getSelfAuthData = createRouteConfig({
    method: 'get',
    path: '/auth',
    guard: isAuthenticated,
    tags: ['me'],
    summary: 'Get self auth data',
    description: 'Get the current user (self). It includes sessions, oauth accounts and sign in options.',
    responses: {
      200: {
        description: 'User sign-up info',
        content: {
          'application/json': {
            schema: successWithDataSchema(meAuthInfoSchema),
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
            schema: successWithDataSchema(userSchema),
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
    description: 'Terminate sessions of the current user by list of ids.',
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

  public leaveEntity = createRouteConfig({
    method: 'delete',
    path: '/leave',
    guard: isAuthenticated,
    tags: ['me'],
    summary: 'Leave entity',
    description: 'Leave any entity on your own.',
    security: [],
    request: {
      query: leaveEntityQuerySchema,
    },
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
