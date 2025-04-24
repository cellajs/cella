import { z } from 'zod';
import { createRouteConfig } from '#/lib/route-config';
import { isAuthenticated, isPublicAccess } from '#/middlewares/guard';
import { tokenLimiter } from '#/middlewares/rate-limiter/limiters';
import { errorResponses, successWithDataSchema, successWithErrorsSchema, successWithoutDataSchema } from '#/utils/schema/responses';
import { updateUserBodySchema, userSchema } from '../users/schema';
import { leaveEntityQuerySchema, meAuthInfoSchema, passkeyRegistrationBodySchema, unsubscribeSelfQuerySchema, userMenuSchema } from './schema';

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
    summary: 'Get menu',
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
        content: { 'application/json': { schema: z.object({ ids: z.array(z.string()).min(1, 'Add at least one item') }) } },
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

  public unsubscribeSelf = createRouteConfig({
    method: 'get',
    path: '/unsubscribe',
    guard: isPublicAccess,
    middleware: [tokenLimiter('unsubscribe')],
    tags: ['me'],
    summary: 'Unsubscribe',
    description: 'Unsubscribe using a personal unsubscribe token.',
    request: {
      query: unsubscribeSelfQuerySchema,
    },
    responses: {
      302: {
        description: 'Redirect to FE',
        headers: z.object({ Location: z.string() }),
      },
      ...errorResponses,
    },
  });
  public getUploadToken = createRouteConfig({
    method: 'get',
    path: '/upload-token',
    guard: isAuthenticated,
    tags: ['me'],
    summary: 'Get upload token',
    description:
      'This endpoint is used to get an upload token for a user or organization. The token can be used to upload public or private images/files to your S3 bucket using imado.',
    request: {
      query: z.object({
        public: z.string().optional().default('false'),
        organization: z.string().optional(),
        width: z.string().optional(),
        height: z.string().optional(),
        quality: z.string().optional(),
        format: z.string().optional(),
      }),
    },
    responses: {
      200: {
        description: 'Upload token with a scope for a user or organization',
        content: {
          'application/json': {
            schema: successWithDataSchema(z.string()),
          },
        },
      },
      ...errorResponses,
    },
  });

  public createPasskey = createRouteConfig({
    method: 'post',
    path: '/passkey',
    guard: isAuthenticated,
    tags: ['me'],
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
    summary: 'Delete passkey',
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
export default new MeRouteConfig();
