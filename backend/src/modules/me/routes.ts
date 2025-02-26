import { z } from 'zod';
import { createRouteConfig } from '#/lib/route-config';
import { isAuthenticated } from '#/middlewares/guard';
import { idOrSlugSchema, idsBodySchema } from '#/utils/schema/common';
import { errorResponses, successWithDataSchema, successWithErrorsSchema, successWithoutDataSchema } from '#/utils/schema/responses';
import { limitEntitySchema } from '../general/schema';
import { updateUserBodySchema, userSchema } from '../users/schema';
import { leaveEntityQuerySchema, meAuthInfoSchema, meRelativeEntitiesSchema, passkeyRegistrationBodySchema, userMenuSchema } from './schema';

class MeRouteConfig {
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

  public getSelfEntities = createRouteConfig({
    method: 'get',
    path: '/entities',
    guard: isAuthenticated,
    tags: ['me'],
    summary: 'Get relevant entities for self.',
    description: 'Get relevant entities that current user (self) is member of.',
    responses: {
      200: {
        description: 'Entities info',
        content: {
          'application/json': {
            schema: successWithDataSchema(meRelativeEntitiesSchema),
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

  public getSelfMenu = createRouteConfig({
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

  public createPasskey = createRouteConfig({
    method: 'post',
    path: '/passkey-registration',
    guard: isAuthenticated,
    tags: ['auth'],
    summary: 'Create passkey',
    description:
      'The server associates the public key and the credential ID with the user for future authentication flows and checks the validity of the operation by verifying the signed challenge with the public key.',
    security: [],
    request: {
      body: {
        required: true,
        content: {
          'application/json': {
            schema: passkeyRegistrationBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Passkey created',
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

  public domainOrganizations = createRouteConfig({
    method: 'get',
    path: '/domain-organizations',
    guard: isAuthenticated,
    tags: ['me'],
    summary: 'Get domain organizations',
    description: 'Get organizations with witch current user emails have same domain.',
    security: [],
    responses: {
      200: {
        description: 'List of organizations',
        content: {
          'application/json': {
            schema: successWithDataSchema(z.array(limitEntitySchema)),
          },
        },
      },
      ...errorResponses,
    },
  });

  public joinByDomain = createRouteConfig({
    method: 'post',
    path: '/join-by-domain/{idOrSlug}',
    guard: [isAuthenticated],
    tags: ['me'],
    summary: 'Join to suggested by domain organization ',
    description: 'Join to organization that match one of user emails domain.',
    request: { params: z.object({ idOrSlug: idOrSlugSchema }) },
    responses: {
      200: {
        description: 'Joined to organization',
        content: {
          'application/json': {
            schema: successWithoutDataSchema,
          },
        },
      },
      ...errorResponses,
    },
  });

  public declineByDomain = createRouteConfig({
    method: 'post',
    path: '/decline-by-domain/{idOrSlug}',
    guard: [isAuthenticated],
    tags: ['me'],
    summary: 'Decline organization suggestion by domain',
    description: 'Decline organization suggestion that match one of user emails domain.',
    request: { params: z.object({ idOrSlug: idOrSlugSchema }) },
    responses: {
      200: {
        description: 'Decline suggestion',
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
export default new MeRouteConfig();
