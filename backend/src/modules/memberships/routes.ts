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
import {
  errorResponses,
  paginationSchema,
  successWithErrorsSchema,
  successWithoutDataSchema
} from '#/utils/schema/responses';

const membershipRoutes = {
  createMemberships: createCustomRoute({
    operationId: 'membershipInvite',
    method: 'post',
    path: '/',
    guard: [isAuthenticated, hasOrgAccess],
    tags: ['memberships'],
    summary: 'Create memberships',
    description: 'Create memberships (invite members that may or may not exist in the system) to an entity such as an organization.',
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
        description: 'Invitation was sent',
        content: { 'application/json': { schema: successWithoutDataSchema } },
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
    description: 'Delete memberships by their ids. This will remove the membership but not delete any user(s).',
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
            schema: successWithErrorsSchema(),
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
    description: 'Update role, muted, or archived status in a membership.',
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
    description: 'Get members of a context entity by id or slug. It returns members (users) with their membership.',
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
    description: 'Get pending membership invitations from a context entity by id or slug. It returns invite info.',
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
