import { z } from '@hono/zod-openapi';
import { createXRoute } from '#/docs/x-routes';
import { hasSystemAccess, isAuthenticated, isPublicAccess } from '#/middlewares/guard';
import { tokenLimiter } from '#/middlewares/rate-limiter/limiters';
import { inviteBodySchema, sendNewsletterBodySchema, systemRoleBaseSchema } from '#/modules/system/system-schema';
import {
  booleanTransformSchema,
  entityIdParamSchema,
  errorResponseRefs,
  idsBodySchema,
  paginationSchema,
  successWithRejectedItemsSchema,
} from '#/schemas';
import { mockSystemInviteResponse } from '../../../mocks/mock-system';
import { mockPaginatedUsersResponse, mockUserResponse } from '../../../mocks/mock-user';
import { membershipBaseSchema } from '../memberships/memberships-schema';
import { userListQuerySchema, userSchema, userUpdateBodySchema } from '../user/user-schema';

const systemRoutes = {
  /**
   * Invite to system
   */
  createInvite: createXRoute({
    operationId: 'systemInvite',
    method: 'post',
    path: '/invite',
    xGuard: [isAuthenticated, hasSystemAccess],
    tags: ['system'],
    summary: 'Invite to system',
    description:
      'Invites one or more users to the system via email. Can be used to onboard system level users or admins.',
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: inviteBodySchema } },
      },
    },
    responses: {
      200: {
        description: 'Invitations are sent',
        content: {
          'application/json': {
            schema: successWithRejectedItemsSchema.extend({ invitesSentCount: z.number() }),
            example: mockSystemInviteResponse(),
          },
        },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Get list of users
   */
  getUsers: createXRoute({
    operationId: 'getUsers',
    method: 'get',
    path: '/',
    xGuard: [isAuthenticated, hasSystemAccess],
    tags: ['system'],
    summary: 'Get list of users',
    description: 'Returns a list of *users*.',
    request: { query: userListQuerySchema },
    responses: {
      200: {
        description: 'Users',
        content: {
          'application/json': {
            schema: paginationSchema(
              userSchema.extend({
                memberships: membershipBaseSchema.array(),
                role: systemRoleBaseSchema.shape.role.optional(),
              }),
            ),
            example: mockPaginatedUsersResponse(),
          },
        },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Delete users
   */
  deleteUsers: createXRoute({
    operationId: 'deleteUsers',
    method: 'delete',
    path: '/',
    xGuard: [isAuthenticated, hasSystemAccess],
    tags: ['system'],
    summary: 'Delete users',
    description:
      "Deletes one or more *users* from the system based on a list of IDs. This also removes the user's memberships (cascade) and sets references to the user to `null` where applicable.",
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: idsBodySchema() } },
      },
    },
    responses: {
      200: {
        description: 'Success',
        content: { 'application/json': { schema: successWithRejectedItemsSchema } },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Update a user
   */
  updateUser: createXRoute({
    operationId: 'updateUser',
    method: 'put',
    path: '/{id}',
    xGuard: [isAuthenticated, hasSystemAccess],
    tags: ['system'],
    summary: 'Update user',
    description: 'Updates a *user* identified by ID.',
    request: {
      params: entityIdParamSchema,
      body: {
        content: { 'application/json': { schema: userUpdateBodySchema } },
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
   * Send newsletter to members
   */
  sendNewsletter: createXRoute({
    operationId: 'sendNewsletter',
    method: 'post',
    path: '/newsletter',
    xGuard: [isAuthenticated, hasSystemAccess],
    tags: ['system'],
    summary: 'Newsletter to members',
    description: 'Sends a newsletter to members of one or more specified organizations.',
    request: {
      query: z.object({ toSelf: booleanTransformSchema }),
      body: {
        required: true,
        content: { 'application/json': { schema: sendNewsletterBodySchema } },
      },
    },
    responses: {
      204: {
        description: 'Newsletter sent',
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Paddle webhook (WIP)
   */
  paddleWebhook: createXRoute({
    operationId: 'paddleWebhook',
    method: 'post',
    path: '/paddle-webhook',
    xGuard: isPublicAccess,
    xRateLimiter: tokenLimiter('paddle'),
    tags: ['system'],
    summary: 'Paddle webhook (WIP)',
    description: 'Receives and handles Paddle subscription events such as purchases, renewals, and cancellations.',
    request: {
      body: { content: { 'application/json': { schema: z.unknown() } } },
    },
    responses: {
      204: {
        description: 'Paddle webhook received',
      },
      ...errorResponseRefs,
    },
  }),
};
export default systemRoutes;
