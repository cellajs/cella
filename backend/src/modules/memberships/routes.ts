import { z } from '@hono/zod-openapi';

import { createCustomRoute } from '#/lib/custom-routes';
import { hasOrgAccess, isAuthenticated } from '#/middlewares/guard';
import {
  memberListQuerySchema,
  membershipCreateBodySchema,
  membershipSchema,
  membershipUpdateBodySchema,
  pendingInvitationListQuerySchema,
  pendingInvitationSchema,
} from '#/modules/memberships/schema';
import { memberSchema } from '#/modules/users/schema';
import { entityWithTypeQuerySchema, idInOrgParamSchema, idOrSlugSchema, idsBodySchema, inOrgParamSchema } from '#/utils/schema/common';
import { errorResponses, paginationSchema, successWithRejectedIdsSchema } from '#/utils/schema/responses';

const membershipRoutes = {
  createMemberships: createCustomRoute({
    operationId: 'membershipInvite',
    method: 'post',
    path: '/',
    guard: [isAuthenticated, hasOrgAccess],
    tags: ['memberships'],
    summary: 'Create memberships',
    description: 'Creates one or more *memberships*, inviting users (existing or new) to a contextual entity such as an organization.',
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
        description: 'Number of sended invitations',
        content: { 'application/json': { schema: z.number() } },
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
            schema: successWithRejectedIdsSchema(),
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
  getMembers: createCustomRoute({
    operationId: 'getMembers',
    method: 'get',
    path: '/members',
    guard: [isAuthenticated, hasOrgAccess],
    tags: ['memberships'],
    summary: 'Get list of members',
    description: 'Retrieves members (users) of a contextual entity by ID or slug, including their associated *membership* data.',
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
    description: 'Returns pending *membership* invitations for a contextual entity, identified by ID or slug.',
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
};
export default membershipRoutes;
