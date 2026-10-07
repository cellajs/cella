import { z } from '@hono/zod-openapi';
import { createXRoutes, json, jsonBody, xRoute } from '#/core/x-routes';
import { orgGuard, tenantGuard, userGuard } from '#/middlewares/guard';
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

const membershipRoutes = createXRoutes(['memberships', 'cella'], {
  createMemberships: xRoute({
    operationId: 'membershipInvite',
    method: 'post',
    path: '/',
    xGuard: [userGuard, tenantGuard, orgGuard],
    xRateLimiter: [spamLimiter, bulkPointsLimiter],
    summary: 'Create memberships',
    description:
      "Creates one or more memberships, inviting users (existing or new) to a channel entity such as an organization. A created membership carries muted, archived and display order only when it is the caller's own.",
    request: { params: tenantOrgParamSchema, query: entityWithTypeQuerySchema, body: jsonBody(membershipCreateBodySchema) },
    responses: {
      200: json(
        'Created memberships and invite count',
        batchResponseSchema(memberMembershipSchema).extend({ invitesSentCount: z.number() }),
        mockMembershipInviteResponse(),
      ),
    },
  }),
  deleteMemberships: xRoute({
    method: 'delete',
    path: '/',
    xGuard: [userGuard, tenantGuard, orgGuard],
    xRateLimiter: [bulkPointsLimiter],
    summary: 'Delete memberships',
    description: 'Deletes one or more memberships by ID. This removes the membership but does not delete the associated user(s).',
    request: { params: tenantOrgParamSchema, query: entityWithTypeQuerySchema, body: jsonBody(idsBodySchema()) },
    responses: { 200: json('Success', batchResponseSchema()) },
  }),
  updateMembership: xRoute({
    method: 'put',
    path: '/{id}',
    xGuard: [userGuard, tenantGuard, orgGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Update membership',
    description:
      "Updates a membership: its role, or the muted, archived or display order status. Send at least one field. Muted, archived and display order are set by the member only, and the response carries them only on the caller's own membership. A role change, and any change to another member's membership, requires update permission on the channel.",
    request: { params: idInTenantOrgParamSchema, body: jsonBody(membershipUpdateBodySchema) },
    responses: { 200: json('Membership updated', updatedMembershipSchema, mockMembershipResponse()) },
  }),
  handleMembershipInvitation: xRoute({
    method: 'post',
    path: '/{id}/{acceptOrReject}',
    xGuard: [userGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Respond to membership invitation',
    description: 'Accepting activates the associated membership. Rejecting simply removes the invitation token.',
    request: { params: z.object({ id: validIdSchema, acceptOrReject: z.enum(['accept', 'reject']) }) },
    responses: { 200: json('Invitation was accepted', channelBaseSchema, mockChannelBase()) },
  }),
  getMembers: xRoute({
    method: 'get',
    path: '/members',
    xGuard: [userGuard, tenantGuard, orgGuard],
    summary: 'Get list of members',
    description:
      'Retrieves members (users) of a channel entity by ID, including their associated membership data. Pass ?include=counts for per-member counts, and ?include=mfa for `mfaRequired`, which only admins of the organization receive.',
    request: { params: tenantOrgParamSchema, query: memberListQuerySchema },
    responses: { 200: json('Members', paginationSchema(memberSchema), mockPaginatedMembersResponse()) },
  }),
  getPendingMemberships: xRoute({
    method: 'get',
    path: '/pending',
    xGuard: [userGuard, tenantGuard, orgGuard],
    summary: 'Get list of pending memberships',
    description:
      'Returns the pending invitations of a channel entity, identified by ID: the address each went to, its role and its inviter. A row looks the same whether an account holds the address or not.',
    request: { params: tenantOrgParamSchema, query: pendingMembershipListQuerySchema },
    responses: { 200: json('Pending memberships', paginationSchema(pendingMembershipSchema), mockPaginatedPendingMembershipsResponse()) },
  }),
  resendPendingInvitation: xRoute({
    method: 'post',
    path: '/pending/{id}/resend',
    xGuard: [userGuard, tenantGuard, orgGuard],
    xRateLimiter: [spamLimiter, singlePointsLimiter],
    summary: 'Resend pending invitation',
    description:
      'Re-sends the invitation email for a pending membership, named by its own id; an invitation holding a token gets a fresh one. Answers 204 alike for every pending invitation. Requires update permission on the invited channel; the public auth resend endpoint stays for invitees holding an expired token.',
    request: { params: idInTenantOrgParamSchema },
    responses: { 204: { description: 'Invitation resent' } },
  }),
});

export { membershipRoutes };
