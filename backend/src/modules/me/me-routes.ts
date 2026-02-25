import { z } from '@hono/zod-openapi';
import { createXRoute } from '#/docs/x-routes';
import { authGuard, crossTenantGuard, publicGuard } from '#/middlewares/guard';
import { tokenLimiter } from '#/middlewares/rate-limiter/limiters';
import {
  meAuthDataSchema,
  mePendingInvitationSchema,
  meSchema,
  toggleMfaBodySchema,
  uploadTokenQuerySchema,
  uploadTokenSchema,
} from '#/modules/me/me-schema';
import { membershipBaseSchema } from '#/modules/memberships/memberships-schema';
import { userFlagsSchema, userSchema, userUpdateBodySchema } from '#/modules/user/user-schema';
import {
  batchResponseSchema,
  entityWithTypeQuerySchema,
  errorResponseRefs,
  idsBodySchema,
  locationSchema,
  paginationSchema,
} from '#/schemas';
import {
  mockMeAuthDataResponse,
  mockMeResponse,
  mockPaginatedInvitationsResponse,
  mockUploadTokenResponse,
} from '../../../mocks/mock-me';
import { mockUserResponse } from '../../../mocks/mock-user';

const meRoutes = {
  /**
   * Get self
   */
  getMe: createXRoute({
    operationId: 'getMe',
    method: 'get',
    path: '/',
    xGuard: authGuard,
    tags: ['me'],
    summary: 'Get self',
    description: 'Returns the *current user*.',
    responses: {
      200: {
        description: 'User',
        content: {
          'application/json': {
            schema: meSchema,
            example: mockMeResponse(),
          },
        },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Get list of invitations
   */
  getMyInvitations: createXRoute({
    operationId: 'getMyInvitations',
    method: 'get',
    path: '/invitations',
    xGuard: [authGuard, crossTenantGuard],
    tags: ['me'],
    summary: 'Get list of invitations',
    description: 'Returns a list of pending memberships with entity data.',
    responses: {
      200: {
        description: 'Invitations pending',
        content: {
          'application/json': {
            schema: paginationSchema(mePendingInvitationSchema),
            example: mockPaginatedInvitationsResponse(),
          },
        },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Update self
   */
  updateMe: createXRoute({
    operationId: 'updateMe',
    method: 'put',
    path: '/',
    xGuard: authGuard,
    tags: ['me'],
    summary: 'Update self',
    description: 'Updates the *current user*.',
    request: {
      body: {
        required: true,
        content: {
          'application/json': {
            schema: userUpdateBodySchema.extend({ userFlags: userFlagsSchema.partial().optional() }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'User',
        content: { 'application/json': { schema: userSchema, example: mockUserResponse() } },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Delete self
   */
  deleteMe: createXRoute({
    operationId: 'deleteMe',
    method: 'delete',
    path: '/',
    xGuard: authGuard,
    tags: ['me'],
    summary: 'Delete self',
    description:
      "Deletes the *current user*. This also removes the user's memberships (cascade) and sets references to the user to `null` where applicable.",
    responses: {
      204: { description: 'User deleted' },
      ...errorResponseRefs,
    },
  }),
  /**
   * Get auth data
   */
  getMyAuth: createXRoute({
    operationId: 'getMyAuth',
    method: 'get',
    path: '/auth',
    xGuard: authGuard,
    tags: ['me'],
    summary: 'Get auth data',
    description:
      'Returns authentication related data of *current user*, including sessions, OAuth accounts, and sign in options.',
    responses: {
      200: {
        description: 'User sign-up info',
        content: { 'application/json': { schema: meAuthDataSchema, example: mockMeAuthDataResponse() } },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Terminate sessions
   */
  deleteMySessions: createXRoute({
    operationId: 'deleteMySessions',
    method: 'delete',
    path: '/sessions',
    xGuard: authGuard,
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
        content: { 'application/json': { schema: batchResponseSchema() } },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Leave entity
   */
  deleteMyMembership: createXRoute({
    operationId: 'deleteMyMembership',
    method: 'delete',
    path: '/leave',
    xGuard: authGuard,
    tags: ['me'],
    summary: 'Leave entity',
    description: 'Removes the *current user* from an entity they are a member of.',
    request: { query: entityWithTypeQuerySchema },
    responses: {
      204: {
        description: 'Membership removed',
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Unsubscribe
   */
  unsubscribeMe: createXRoute({
    operationId: 'unsubscribeMe',
    method: 'get',
    path: '/unsubscribe',
    xGuard: publicGuard,
    xRateLimiter: tokenLimiter('unsubscribe'),
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
      ...errorResponseRefs,
    },
  }),
  /**
   * Get upload token
   */
  getUploadToken: createXRoute({
    operationId: 'getUploadToken',
    method: 'get',
    path: '/upload-token',
    xGuard: authGuard,
    tags: ['me'],
    summary: 'Get upload token',
    description:
      'Generates and returns an upload token for uploading files or images to a private S3 bucket, scoped to the *current user* and organization',
    request: { query: uploadTokenQuerySchema },
    responses: {
      200: {
        description: 'Upload token with a scope for a user or organization',
        content: { 'application/json': { schema: uploadTokenSchema, example: mockUploadTokenResponse() } },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Toggle MFA
   */
  toggleMfa: createXRoute({
    operationId: 'toggleMfa',
    method: 'put',
    path: '/mfa',
    xGuard: authGuard,
    tags: ['me'],
    summary: 'Toggle MFA',
    description:
      'Enable or disable multifactor authentication for the *current user*. Always requires passkey or TOTP reauthentication.',
    request: {
      body: { content: { 'application/json': { schema: toggleMfaBodySchema } } },
    },
    responses: {
      200: {
        description: 'User',
        content: { 'application/json': { schema: userSchema, example: mockUserResponse() } },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Get my memberships
   */
  getMyMemberships: createXRoute({
    operationId: 'getMyMemberships',
    method: 'get',
    path: '/memberships',
    xGuard: authGuard,
    tags: ['me'],
    summary: 'Get my memberships',
    description: 'Returns all memberships for the *current user* across all context entities.',
    responses: {
      200: {
        description: 'User memberships',
        content: {
          'application/json': {
            schema: z.object({ items: z.array(membershipBaseSchema) }),
          },
        },
      },
      ...errorResponseRefs,
    },
  }),
};
export default meRoutes;
