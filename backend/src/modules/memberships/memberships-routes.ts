import { z } from '@hono/zod-openapi';
import { createXRoute } from '#/core/x-routes';
import { crossTenantGuard, orgGuard, tenantGuard, userGuard } from '#/middlewares/guard';
import { bulkPointsLimiter, singlePointsLimiter, spamLimiter } from '#/middlewares/rate-limiter/limiters';
import {
  memberListQuerySchema,
  memberMembershipSchema,
  membershipCreateBodySchema,
  membershipUpdateBodySchema,
  pendingMembershipListQuerySchema,
  pendingMembershipSchema,
  updatedMembershipSchema,
} from '#/modules/memberships/memberships-schema';
import { memberSchema } from '#/modules/user/user-schema';
import {
  batchResponseSchema,
  entityWithTypeQuerySchema,
  errorResponseRefs,
  idInTenantOrgParamSchema,
  idsBodySchema,
  paginationSchema,
  tenantOrgParamSchema,
  validIdSchema,
} from '#/schemas';
import { channelBaseSchema } from '#/schemas/entity-base';
import { mockChannelBase } from '#/schemas/entity-base-mocks';
import {
  mockMembershipInviteResponse,
  mockMembershipResponse,
  mockPaginatedMembersResponse,
  mockPaginatedPendingMembershipsResponse,
} from './memberships-mocks';

const membershipRoutes = {
  createMemberships: createXRoute({
    operationId: 'membershipInvite',
    method: 'post',
    path: '/',
    xGuard: [userGuard, tenantGuard, orgGuard],
    xRateLimiter: [spamLimiter, bulkPointsLimiter],
    tags: ['memberships', 'cella'],
    summary: 'Create memberships',
    description:
      "Creates one or more memberships, inviting users (existing or new) to a channel entity such as an organization. A created membership carries muted, archived and display order only when it is the caller's own.",
    request: {
      params: tenantOrgParamSchema,
      query: entityWithTypeQuerySchema,
      body: {
        required: true,
        content: { 'application/json': { schema: membershipCreateBodySchema } },
      },
    },
    responses: {
      200: {
        description: 'Created memberships and invite count',
        content: {
          'application/json': {
            schema: batchResponseSchema(memberMembershipSchema).extend({ invitesSentCount: z.number() }),
            example: mockMembershipInviteResponse(),
          },
        },
      },
      ...errorResponseRefs,
    },
  }),
  deleteMemberships: createXRoute({
    operationId: 'deleteMemberships',
    method: 'delete',
    path: '/',
    xGuard: [userGuard, tenantGuard, orgGuard],
    xRateLimiter: [bulkPointsLimiter],
    tags: ['memberships', 'cella'],
    summary: 'Delete memberships',
    description:
      'Deletes one or more memberships by ID. This removes the membership but does not delete the associated user(s).',
    request: {
      params: tenantOrgParamSchema,
      query: entityWithTypeQuerySchema,
      body: {
        required: true,
        content: { 'application/json': { schema: idsBodySchema() } },
      },
    },
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: batchResponseSchema(),
          },
        },
      },
      ...errorResponseRefs,
    },
  }),
  updateMembership: createXRoute({
    operationId: 'updateMembership',
    method: 'put',
    path: '/{id}',
    xGuard: [userGuard, tenantGuard, orgGuard],
    xRateLimiter: [singlePointsLimiter],
    tags: ['memberships', 'cella'],
    summary: 'Update membership',
    description:
      "Updates a membership: its role, or the muted, archived or display order status. Send at least one field. Muted, archived and display order are set by the member only, and the response carries them only on the caller's own membership. A role change, and any change to another member's membership, requires update permission on the channel.",
    request: {
      params: idInTenantOrgParamSchema,
      body: {
        content: { 'application/json': { schema: membershipUpdateBodySchema } },
      },
    },
    responses: {
      200: {
        description: 'Membership updated',
        content: { 'application/json': { schema: updatedMembershipSchema, example: mockMembershipResponse() } },
      },
      ...errorResponseRefs,
    },
  }),
  handleMembershipInvitation: createXRoute({
    operationId: 'handleMembershipInvitation',
    method: 'post',
    path: '/{id}/{acceptOrReject}',
    xGuard: [userGuard, crossTenantGuard],
    xRateLimiter: [singlePointsLimiter],
    tags: ['memberships', 'cella'],
    summary: 'Respond to membership invitation',
    description: 'Accepting activates the associated membership. Rejecting simply removes the invitation token.',
    request: {
      params: z.object({ id: validIdSchema, acceptOrReject: z.enum(['accept', 'reject']) }),
    },
    responses: {
      200: {
        description: 'Invitation was accepted',
        content: { 'application/json': { schema: channelBaseSchema, example: mockChannelBase() } },
      },
      ...errorResponseRefs,
    },
  }),
  getMembers: createXRoute({
    operationId: 'getMembers',
    method: 'get',
    path: '/members',
    xGuard: [userGuard, tenantGuard, orgGuard],
    tags: ['memberships', 'cella'],
    summary: 'Get list of members',
    description: 'Retrieves members (users) of a channel entity by ID, including their associated membership data.',
    request: {
      params: tenantOrgParamSchema,
      query: memberListQuerySchema,
    },
    responses: {
      200: {
        description: 'Members',
        content: {
          'application/json': {
            schema: paginationSchema(memberSchema),
            example: mockPaginatedMembersResponse(),
          },
        },
      },
      ...errorResponseRefs,
    },
  }),
  getPendingMemberships: createXRoute({
    operationId: 'getPendingMemberships',
    method: 'get',
    path: '/pending',
    xGuard: [userGuard, tenantGuard, orgGuard],
    tags: ['memberships', 'cella'],
    summary: 'Get list of pending memberships',
    description:
      'Returns the pending invitations of a channel entity, identified by ID: the address each went to, its role and its inviter. A row looks the same whether an account holds the address or not.',
    request: {
      params: tenantOrgParamSchema,
      query: pendingMembershipListQuerySchema,
    },
    responses: {
      200: {
        description: 'Pending memberships',
        content: {
          'application/json': {
            schema: paginationSchema(pendingMembershipSchema),
            example: mockPaginatedPendingMembershipsResponse(),
          },
        },
      },
      ...errorResponseRefs,
    },
  }),
  resendPendingInvitation: createXRoute({
    operationId: 'resendPendingInvitation',
    method: 'post',
    path: '/pending/{id}/resend',
    xGuard: [userGuard, tenantGuard, orgGuard],
    xRateLimiter: [spamLimiter, singlePointsLimiter],
    tags: ['memberships', 'cella'],
    summary: 'Resend pending invitation',
    description:
      'Re-sends the invitation email for a pending membership, named by its own id; an invitation holding a token gets a fresh one. Answers 204 alike for every pending invitation. Requires update permission on the invited channel; the public auth resend endpoint stays for invitees holding an expired token.',
    request: {
      params: idInTenantOrgParamSchema,
    },
    responses: {
      204: { description: 'Invitation resent' },
      ...errorResponseRefs,
    },
  }),
};

export { membershipRoutes };
