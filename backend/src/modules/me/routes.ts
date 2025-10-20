import { z } from '@hono/zod-openapi';
import { createCustomRoute } from '#/lib/custom-routes';
import { isAuthenticated, isPublicAccess } from '#/middlewares/guard';
import { tokenLimiter } from '#/middlewares/rate-limiter/limiters';
import {
  meAuthDataSchema,
  menuSchema,
  mePendingInvitationSchema,
  toggleMfaBodySchema,
  uploadTokenQuerySchema,
  uploadTokenSchema,
} from '#/modules/me/schema';
import { userFlagsSchema, userSchema, userUpdateBodySchema } from '#/modules/users/schema';
import { entityWithTypeQuerySchema, idsBodySchema, locationSchema } from '#/utils/schema/common';
import { errorResponses, paginationSchema, successWithRejectedItemsSchema } from '#/utils/schema/responses';

const meRoutes = {
  getMe: createCustomRoute({
    operationId: 'getMe',
    method: 'get',
    path: '/',
    guard: isAuthenticated,
    tags: ['me'],
    summary: 'Get self',
    description: 'Returns the *current user*.',
    responses: {
      200: {
        description: 'User',
        content: { 'application/json': { schema: userSchema } },
      },
      ...errorResponses,
    },
  }),

  getMyMenu: createCustomRoute({
    operationId: 'getMyMenu',
    method: 'get',
    path: '/menu',
    guard: isAuthenticated,
    tags: ['me'],
    summary: 'Get menu',
    description:
      'Returns a structured list of context entities the *current user* is a member of, grouped by the entity type and enriched with both `memebrship` and `entity` data.',
    responses: {
      200: {
        description: 'Menu of user',
        content: { 'application/json': { schema: menuSchema } },
      },
      ...errorResponses,
    },
  }),

  getMyInvitations: createCustomRoute({
    operationId: 'getMyInvitations',
    method: 'get',
    path: '/invitations',
    guard: isAuthenticated,
    tags: ['me'],
    summary: 'Get list of invitations',
    description: 'Returns a list of pending memberships with entity data - meaning activatedAt is still null.',
    responses: {
      200: {
        description: 'Invitations pending',
        content: { 'application/json': { schema: paginationSchema(mePendingInvitationSchema) } },
      },
      ...errorResponses,
    },
  }),

  updateMe: createCustomRoute({
    operationId: 'updateMe',
    method: 'put',
    path: '/',
    guard: isAuthenticated,
    tags: ['me'],
    summary: 'Update self',
    description: 'Updates the *current user*.',
    request: {
      body: {
        required: true,
        content: {
          'application/json': { schema: userUpdateBodySchema.extend({ userFlags: userFlagsSchema.partial().optional() }) },
        },
      },
    },
    responses: {
      200: {
        description: 'User',
        content: { 'application/json': { schema: userSchema } },
      },
      ...errorResponses,
    },
  }),

  deleteMe: createCustomRoute({
    operationId: 'deleteMe',
    method: 'delete',
    path: '/',
    guard: isAuthenticated,
    tags: ['me'],
    summary: 'Delete self',
    description:
      "Deletes the *current user*. This also removes the user's memberships (cascade) and sets references to the user to `null` where applicable.",
    responses: {
      204: { description: 'User deleted' },
      ...errorResponses,
    },
  }),

  getMyAuth: createCustomRoute({
    operationId: 'getMyAuth',
    method: 'get',
    path: '/auth',
    guard: isAuthenticated,
    tags: ['me'],
    summary: 'Get auth data',
    description: 'Returns authentication related data of *current user*, including sessions, OAuth accounts, and sign in options.',
    responses: {
      200: {
        description: 'User sign-up info',
        content: { 'application/json': { schema: meAuthDataSchema } },
      },
      ...errorResponses,
    },
  }),

  deleteMySessions: createCustomRoute({
    operationId: 'deleteMySessions',
    method: 'delete',
    path: '/sessions',
    guard: isAuthenticated,
    tags: ['me'],
    summary: 'Terminate sessions',
    description: 'Ends one or more sessions for the *current user* based on provided session IDs.',
    request: {
      required: true,
      body: {
        content: { 'application/json': { schema: idsBodySchema() } },
      },
    },

    responses: {
      200: {
        description: 'Success',
        content: { 'application/json': { schema: successWithRejectedItemsSchema } },
      },
      ...errorResponses,
    },
  }),

  deleteMyMembership: createCustomRoute({
    operationId: 'deleteMyMembership',
    method: 'delete',
    path: '/leave',
    guard: isAuthenticated,
    tags: ['me'],
    summary: 'Leave entity',
    description: 'Removes the *current user* from an entity they are a member of.',
    request: { query: entityWithTypeQuerySchema },
    responses: {
      204: {
        description: 'Membership removed',
      },
      ...errorResponses,
    },
  }),

  unsubscribeMe: createCustomRoute({
    operationId: 'unsubscribeMe',
    method: 'get',
    path: '/unsubscribe',
    guard: isPublicAccess,
    middleware: [tokenLimiter('unsubscribe')],
    tags: ['me'],
    summary: 'Unsubscribe',
    description:
      'Unsubscribes the user from email notifications using a personal unsubscribe token. No authentication is required, as the token implicitly identifies the *current user*.',
    request: { query: z.object({ token: z.string() }) },
    responses: {
      302: {
        description: 'Redirect to FE',
        headers: locationSchema,
      },
      ...errorResponses,
    },
  }),

  getUploadToken: createCustomRoute({
    operationId: 'getUploadToken',
    method: 'get',
    path: '/upload-token',
    guard: isAuthenticated,
    tags: ['me'],
    summary: 'Get upload token',
    description:
      'Generates and returns an upload token for uploading files or images to a private S3 bucket, scoped to the *current user* and organization',
    request: { query: uploadTokenQuerySchema },
    responses: {
      200: {
        description: 'Upload token with a scope for a user or organization',
        content: { 'application/json': { schema: uploadTokenSchema } },
      },
      ...errorResponses,
    },
  }),

  toggleMfa: createCustomRoute({
    operationId: 'toggleMfa',
    method: 'put',
    path: '/mfa',
    guard: isAuthenticated,
    tags: ['me'],
    summary: 'Toggle MFA',
    description:
      'Enable or disable multifactor authentication for the *current user*. Requires passkey or TOTP reauthentication if session is older than 1 hour.',
    request: {
      body: { content: { 'application/json': { schema: toggleMfaBodySchema } } },
    },
    responses: {
      200: {
        description: 'User',
        content: { 'application/json': { schema: userSchema } },
      },
      ...errorResponses,
    },
  }),
};
export default meRoutes;
