import { z } from '@hono/zod-openapi';
import { createCustomRoute } from '#/lib/custom-routes';
import { hasOrgAccess, isAuthenticated } from '#/middlewares/guard';
import {
  memberListQuerySchema,
  membershipCreateBodySchema,
  membershipSchema,
  membershipUpdateBodySchema,
  pendingMembershipListQuerySchema,
  pendingMembershipSchema,
} from '#/modules/memberships/schema';
import { memberSchema } from '#/modules/users/schema';
import { entityWithTypeQuerySchema, idInOrgParamSchema, idOrSlugSchema, idSchema, idsBodySchema, inOrgParamSchema } from '#/utils/schema/common';
import { errorResponses, paginationSchema, successWithRejectedItemsSchema } from '#/utils/schema/responses';
import { contextEntityBaseSchema } from '../entities/schema-base';

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
        required: true,
        content: { 'application/json': { schema: membershipCreateBodySchema } },
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
        required: true,
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
        content: { 'application/json': { schema: membershipUpdateBodySchema } },
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
    guard: [isAuthenticated],
    tags: ['membership'],
    summary: 'Respond to membership invitation',
    description: 'Accepting activates the associated membership. Rejecting simply removes the invitation token.',
    request: { params: z.object({ id: idSchema, acceptOrReject: z.enum(['accept', 'reject']), orgIdOrSlug: idOrSlugSchema }) },
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
      params: inOrgParamSchema,
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
  getPendingMemberships: createCustomRoute({
    operationId: 'getPendingMemberships',
    method: 'get',
    path: '/pending',
    guard: [isAuthenticated, hasOrgAccess],
    tags: ['memberships'],
    summary: 'Get list of pending memberships',
    description:
      'Returns pending memberships for a context entity, identified by ID or slug. This does not include pending invitations for non-existing users.',
    request: {
      params: inOrgParamSchema,
      query: pendingMembershipListQuerySchema,
    },
    responses: {
      200: {
        description: 'Pending memberships',
        content: {
          'application/json': {
            schema: paginationSchema(pendingMembershipSchema),
          },
        },
      },
      ...errorResponses,
    },
  }),
};
export default membershipRoutes;
