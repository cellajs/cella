import { z } from '@hono/zod-openapi';
import { createXRoute } from '#/core/x-routes';
import { authGuard, sysAdminGuard } from '#/middlewares/guard';
import { bulkPointsLimiter, singlePointsLimiter, spamLimiter } from '#/middlewares/rate-limiter/limiters';
import { inviteBodySchema, sendNewsletterBodySchema } from '#/modules/system/system-schema';
import { mockUserResponse } from '#/modules/user/user-mocks';
import {
  batchResponseSchema,
  booleanTransformSchema,
  entityIdParamSchema,
  errorResponseRefs,
  idsBodySchema,
} from '#/schemas';
import { userSchema, userUpdateBodySchema } from '../user/user-schema';
import { mockSystemInviteResponse } from './system-mocks';

const systemRoutes = {
  /**
   * Invite to system
   */
  createInvite: createXRoute({
    operationId: 'systemInvite',
    method: 'post',
    path: '/invite',
    xGuard: [authGuard, sysAdminGuard],
    xRateLimiter: [spamLimiter, bulkPointsLimiter],
    tags: ['system', 'cella'],
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
            schema: batchResponseSchema().extend({ invitesSentCount: z.number() }),
            example: mockSystemInviteResponse(),
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
    xGuard: [authGuard, sysAdminGuard],
    xRateLimiter: [bulkPointsLimiter],
    tags: ['system', 'cella'],
    summary: 'Delete users',
    description:
      "Deletes one or more users from the system based on a list of IDs. This also removes the user's memberships (cascade) and sets references to the user to null where applicable.",
    request: {
      body: {
        required: true,
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
   * Update a user
   */
  updateUser: createXRoute({
    operationId: 'updateUser',
    method: 'put',
    path: '/{id}',
    xGuard: [authGuard, sysAdminGuard],
    xRateLimiter: [singlePointsLimiter],
    tags: ['system', 'cella'],
    summary: 'Update user',
    description: 'Updates a user identified by ID.',
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
    xGuard: [authGuard, sysAdminGuard],
    xRateLimiter: [singlePointsLimiter],
    tags: ['system', 'cella'],
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
};
export default systemRoutes;
