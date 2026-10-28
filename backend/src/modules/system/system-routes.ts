import { z } from '@hono/zod-openapi';
import { createXRoutes, errors, json, jsonBody, xRoute } from '#/core/x-routes';
import { sysAdminGuard, userGuard } from '#/middlewares/guard';
import { bulkPointsLimiter, singlePointsLimiter, spamLimiter } from '#/middlewares/rate-limiter/limiters';
import { mockSystemInviteResponse } from '#/modules/system/system-mocks';
import { inviteBodySchema, sendNewsletterBodySchema, systemInviteResponseSchema, systemUserUpdateBodySchema } from '#/modules/system/system-schema';
import { userSchema } from '#/modules/user/user-schema';
import { batchResponseSchema, booleanTransformSchema, entityIdParamSchema, idsBodySchema } from '#/schemas';

const systemRoutes = createXRoutes(['system', 'cella'], {
  createInvite: xRoute({
    operationId: 'systemInvite',
    method: 'post',
    path: '/invite',
    xGuard: [userGuard, sysAdminGuard],
    xRateLimiter: [spamLimiter, bulkPointsLimiter],
    summary: 'Invite to system',
    description: 'Invites one or more users to the system via email. Can be used to onboard system level users or admins.',
    request: { body: jsonBody(inviteBodySchema) },
    responses: { 200: json('Invitations are sent', systemInviteResponseSchema, mockSystemInviteResponse()) },
  }),
  deleteUsers: xRoute({
    method: 'delete',
    path: '/',
    xGuard: [userGuard, sysAdminGuard],
    xRateLimiter: [bulkPointsLimiter],
    summary: 'Delete users',
    description:
      "Deletes one or more users from the system based on a list of IDs. This also removes the user's memberships (cascade) and sets references to the user to null where applicable.",
    request: { body: jsonBody(idsBodySchema()) },
    responses: { 200: json('Success', batchResponseSchema()), ...errors(404, 409) },
  }),
  updateUser: xRoute({
    method: 'put',
    path: '/{id}',
    xGuard: [userGuard, sysAdminGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Update user',
    description: 'Updates a user identified by ID.',
    request: { params: entityIdParamSchema, body: jsonBody(systemUserUpdateBodySchema) },
    responses: { 200: json('User', userSchema), ...errors(404, 409) },
  }),
  sendNewsletter: xRoute({
    method: 'post',
    path: '/newsletter',
    xGuard: [userGuard, sysAdminGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Newsletter to members',
    description: 'Sends a newsletter to members of one or more specified organizations.',
    request: { query: z.object({ toSelf: booleanTransformSchema }), body: jsonBody(sendNewsletterBodySchema) },
    responses: { 204: { description: 'Newsletter sent' } },
  }),
});

export { systemRoutes };
