import { z } from 'zod';
import { createCustomRoute } from '#/lib/custom-routes';
import { isAuthenticated, isPublicAccess } from '#/middlewares/guard';
import { tokenLimiter } from '#/middlewares/rate-limiter/limiters';
import { entityWithTypeQuerySchema } from '#/utils/schema/common';
import { errorResponses, successWithDataSchema, successWithErrorsSchema, successWithoutDataSchema } from '#/utils/schema/responses';
import { userSchema, userUpdateBodySchema } from '../users/schema';
import { meAuthDataSchema, menuSchema, passkeyRegistrationBodySchema, uploadTokenQuerySchema, uploadTokenSchema } from './schema';

class MeRoutes {
  public getMe = createCustomRoute({
    method: 'get',
    path: '/',
    guard: isAuthenticated,
    tags: ['me'],
    summary: 'Get me',
    description: 'Get the current user (me). It includes a `counts` object.',
    responses: {
      200: {
        description: 'User',
        content: { 'application/json': { schema: successWithDataSchema(userSchema) } },
      },
      ...errorResponses,
    },
  });

  public getSelfAuthData = createCustomRoute({
    method: 'get',
    path: '/auth',
    guard: isAuthenticated,
    tags: ['me'],
    summary: 'Get self auth data',
    description: 'Get the current user (self). It includes sessions, oauth accounts and sign in options.',
    responses: {
      200: {
        description: 'User sign-up info',
        content: { 'application/json': { schema: successWithDataSchema(meAuthDataSchema) } },
      },
      ...errorResponses,
    },
  });

  public updateSelf = createCustomRoute({
    method: 'put',
    path: '/',
    guard: isAuthenticated,
    tags: ['me'],
    summary: 'Update self',
    description: 'Update the current user (self).',
    request: {
      body: { content: { 'application/json': { schema: userUpdateBodySchema } } },
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

  public deleteSelf = createCustomRoute({
    method: 'delete',
    path: '/',
    guard: isAuthenticated,
    tags: ['me'],
    summary: 'Delete self',
    description: 'Delete the current user (self).',
    responses: {
      200: {
        description: 'User deleted',
        content: { 'application/json': { schema: successWithoutDataSchema } },
      },
      ...errorResponses,
    },
  });

  public getSelfMenu = createCustomRoute({
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
        content: { 'application/json': { schema: successWithDataSchema(menuSchema) } },
      },
      ...errorResponses,
    },
  });

  public deleteSessions = createCustomRoute({
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
        content: { 'application/json': { schema: successWithErrorsSchema() } },
      },
      ...errorResponses,
    },
  });

  public leaveEntity = createCustomRoute({
    method: 'delete',
    path: '/leave',
    guard: isAuthenticated,
    tags: ['me'],
    summary: 'Leave entity',
    description: 'Remove your own entity membership by yourself.',
    security: [],
    request: {
      query: entityWithTypeQuerySchema,
    },
    responses: {
      200: {
        description: 'Membership removed',
        content: { 'application/json': { schema: successWithoutDataSchema } },
      },
      ...errorResponses,
    },
  });

  public unsubscribeSelf = createCustomRoute({
    method: 'get',
    path: '/unsubscribe',
    guard: isPublicAccess,
    middleware: [tokenLimiter('unsubscribe')],
    tags: ['me'],
    summary: 'Unsubscribe',
    description: 'Unsubscribe using a personal unsubscribe token.',
    request: {
      query: z.object({ token: z.string() }),
    },
    responses: {
      302: {
        description: 'Redirect to FE',
        headers: z.object({ Location: z.string() }),
      },
      ...errorResponses,
    },
  });
  public getUploadToken = createCustomRoute({
    method: 'get',
    path: '/upload-token',
    guard: isAuthenticated,
    tags: ['me'],
    summary: 'Get upload token',
    description:
      'This endpoint is used to get an upload token for a user or organization. The token can be used to upload public or private images/files to your S3 bucket using',
    request: {
      query: uploadTokenQuerySchema,
    },
    responses: {
      200: {
        description: 'Upload token with a scope for a user or organization',
        content: {
          'application/json': {
            schema: successWithDataSchema(uploadTokenSchema),
          },
        },
      },
      ...errorResponses,
    },
  });

  public createPasskey = createCustomRoute({
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
        content: { 'application/json': { schema: passkeyRegistrationBodySchema } },
      },
    },
    responses: {
      200: {
        description: 'Passkey created',
        content: { 'application/json': { schema: successWithoutDataSchema } },
      },
      ...errorResponses,
    },
  });

  public deletePasskey = createCustomRoute({
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
        content: { 'application/json': { schema: successWithoutDataSchema } },
      },
      ...errorResponses,
    },
  });
}
export default new MeRoutes();
