import { z } from '@hono/zod-openapi';
import { createCustomRoute } from '#/lib/custom-routes';
import { hasOrgAccess, isAuthenticated, isPublicAccess } from '#/middlewares/guard';
import { spamLimiter } from '#/middlewares/rate-limiter/limiters';
import { contextEntityBaseSchema } from '#/modules/entities/schema';
import {
  memberListQuerySchema,
  membershipCreateBodySchema,
  membershipSchema,
  membershipUpdateBodySchema,
  pendingInvitationListQuerySchema,
  pendingInvitationSchema,
} from '#/modules/memberships/schema';
import { memberSchema } from '#/modules/users/schema';
import {
  emailOrTokenIdQuerySchema,
  entityWithTypeQuerySchema,
  idInOrgParamSchema,
  idOrSlugSchema,
  idsBodySchema,
  inOrgParamSchema,
} from '#/utils/schema/common';
import { errorResponses, paginationSchema, successWithoutDataSchema, successWithRejectedItemsSchema } from '#/utils/schema/responses';

const membershipRoutes = {
  createMemberships: createCustomRoute({
    operationId: 'membershipInvite',
    method: 'post',
    path: '/',
    guard: [isAuthenticated, hasOrgAccess],
    tags: ['memberships'],
    summary: 'Create memberships',
    description: 'Creates one or more *memberships*, inviting users (existing or new) to a context entity such as an organization.',
    request: {
      params: inOrgParamSchema,
      query: entityWithTypeQuerySchema,
      body: {
        content: {
          'application/json': {
            schema: membershipCreateBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Number of sent invitations',
        content: { 'application/json': { schema: successWithRejectedItemsSchema.extend({ invitesSentCount: z.number() }) } },
      },
      ...errorResponses,
    },
  }),

  deleteMemberships: createCustomRoute({
    operationId: 'deleteMemberships',
    method: 'delete',
    path: '/',
    guard: [isAuthenticated, hasOrgAccess],
    tags: ['memberships'],
    summary: 'Delete memberships',
    description: 'Deletes one or more *memberships* by ID. This removes the membership but does not delete the associated user(s).',
    request: {
      params: inOrgParamSchema,
      query: entityWithTypeQuerySchema,
      body: {
        content: { 'application/json': { schema: idsBodySchema() } },
      },
    },
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: successWithRejectedItemsSchema,
          },
        },
      },
      ...errorResponses,
    },
  }),

  updateMembership: createCustomRoute({
    operationId: 'updateMembership',
    method: 'put',
    path: '/{id}',
    guard: [isAuthenticated, hasOrgAccess],
    tags: ['memberships'],
    summary: 'Update membership',
    description: 'Updates the *membership* metadata, such as role, `muted`, or `archived` status.',
    request: {
      params: idInOrgParamSchema,
      body: {
        content: {
          'application/json': {
            schema: membershipUpdateBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Membership updated',
        content: { 'application/json': { schema: membershipSchema } },
      },
      ...errorResponses,
    },
  }),

  handleMembershipInvitation: createCustomRoute({
    operationId: 'handleMembershipInvitation',
    method: 'post',
    path: '/{id}/{acceptOrReject}',
    guard: isAuthenticated,
    tags: ['membership'],
    summary: 'Respond to membership invitation',
    description: 'Accepting activates the associated membership. Rejecting adds a rejectedAt timestamp.',
    request: { params: z.object({ id: z.string(), acceptOrReject: z.enum(['accept', 'reject']) }) },
    responses: {
      200: {
        description: 'Invitation was accepted',
        content: { 'application/json': { schema: contextEntityBaseSchema } },
      },
      ...errorResponses,
    },
  }),

  getMembers: createCustomRoute({
    operationId: 'getMembers',
    method: 'get',
    path: '/members',
    guard: [isAuthenticated, hasOrgAccess],
    tags: ['memberships'],
    summary: 'Get list of members',
    description: 'Retrieves members (users) of a context entity by ID or slug, including their associated *membership* data.',
    request: {
      params: z.object({ orgIdOrSlug: idOrSlugSchema.optional() }),
      query: memberListQuerySchema,
    },
    responses: {
      200: {
        description: 'Members',
        content: {
          'application/json': {
            schema: paginationSchema(memberSchema),
          },
        },
      },
      ...errorResponses,
    },
  }),
  getPendingInvitations: createCustomRoute({
    operationId: 'getPendingInvitations',
    method: 'get',
    path: '/pending',
    guard: [isAuthenticated, hasOrgAccess],
    tags: ['memberships'],
    summary: 'Get list of invitations',
    description: 'Returns pending *membership* invitations for a context entity, identified by ID or slug.',
    request: {
      params: inOrgParamSchema,
      query: pendingInvitationListQuerySchema,
    },
    responses: {
      200: {
        description: 'Invited members',
        content: {
          'application/json': {
            schema: paginationSchema(pendingInvitationSchema),
          },
        },
      },
      ...errorResponses,
    },
  }),

  resendInvitation: createCustomRoute({
    operationId: 'resendInvitation',
    method: 'post',
    path: '/resend-invitation',
    guard: isPublicAccess,
    middleware: [spamLimiter],
    tags: ['memberships'],
    summary: 'Resend invitation',
    description: 'Resends an invitation email to a new or existing user using the provided email address and token ID.',
    security: [],
    request: {
      body: { content: { 'application/json': { schema: emailOrTokenIdQuerySchema } } },
    },
    responses: {
      200: {
        description: 'Invitation email sent',
        content: { 'application/json': { schema: successWithoutDataSchema } },
      },
      ...errorResponses,
    },
  }),
};
export default membershipRoutes;
