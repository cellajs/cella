import { z } from '@hono/zod-openapi';
import { createXRoute } from '#/docs/x-routes';
import { hasOrgAccess, isAuthenticated } from '#/middlewares/guard';
import { contextEntityBaseSchema } from '#/modules/entities/entities-schema-base';
import {
  memberListQuerySchema,
  membershipCreateBodySchema,
  membershipSchema,
  membershipUpdateBodySchema,
  pendingMembershipListQuerySchema,
  pendingMembershipSchema,
} from '#/modules/memberships/memberships-schema';
import { memberSchema } from '#/modules/user/user-schema';
import {
  entityWithTypeQuerySchema,
  errorResponseRefs,
  idInOrgParamSchema,
  idOrSlugSchema,
  idSchema,
  idsBodySchema,
  inOrgParamSchema,
  paginationSchema,
  successWithRejectedItemsSchema,
} from '#/schemas';
import { mockContextEntityBase } from '../../../mocks/mock-entity-base';
import {
  mockMembershipInviteResponse,
  mockMembershipResponse,
  mockPaginatedInactiveMembershipsResponse,
  mockPaginatedMembersResponse,
} from '../../../mocks/mock-membership';

const membershipRoutes = {
  /**
   * Create memberships
   */
  createMemberships: createXRoute({
    operationId: 'membershipInvite',
    method: 'post',
    path: '/',
    xGuard: [isAuthenticated, hasOrgAccess],
    tags: ['memberships'],
    summary: 'Create memberships',
    description:
      'Creates one or more *memberships*, inviting users (existing or new) to a context entity such as an organization.',
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
        content: {
          'application/json': {
            schema: successWithRejectedItemsSchema.extend({ invitesSentCount: z.number() }),
            example: mockMembershipInviteResponse(),
          },
        },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Delete memberships
   */
  deleteMemberships: createXRoute({
    operationId: 'deleteMemberships',
    method: 'delete',
    path: '/',
    xGuard: [isAuthenticated, hasOrgAccess],
    tags: ['memberships'],
    summary: 'Delete memberships',
    description:
      'Deletes one or more *memberships* by ID. This removes the membership but does not delete the associated user(s).',
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
      ...errorResponseRefs,
    },
  }),
  /**
   * Update membership
   */
  updateMembership: createXRoute({
    operationId: 'updateMembership',
    method: 'put',
    path: '/{id}',
    xGuard: [isAuthenticated, hasOrgAccess],
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
        content: { 'application/json': { schema: membershipSchema, example: mockMembershipResponse() } },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Respond to membership invitation
   */
  handleMembershipInvitation: createXRoute({
    operationId: 'handleMembershipInvitation',
    method: 'post',
    path: '/{id}/{acceptOrReject}',
    xGuard: [isAuthenticated],
    tags: ['memberships'],
    summary: 'Respond to membership invitation',
    description: 'Accepting activates the associated membership. Rejecting simply removes the invitation token.',
    request: {
      params: z.object({ id: idSchema, acceptOrReject: z.enum(['accept', 'reject']), orgIdOrSlug: idOrSlugSchema }),
    },
    responses: {
      200: {
        description: 'Invitation was accepted',
        content: { 'application/json': { schema: contextEntityBaseSchema, example: mockContextEntityBase() } },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Get list of members
   */
  getMembers: createXRoute({
    operationId: 'getMembers',
    method: 'get',
    path: '/members',
    xGuard: [isAuthenticated, hasOrgAccess],
    tags: ['memberships'],
    summary: 'Get list of members',
    description:
      'Retrieves members (users) of a context entity by ID or slug, including their associated *membership* data.',
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
            example: mockPaginatedMembersResponse(),
          },
        },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Get list of pending memberships
   */
  getPendingMemberships: createXRoute({
    operationId: 'getPendingMemberships',
    method: 'get',
    path: '/pending',
    xGuard: [isAuthenticated, hasOrgAccess],
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
            example: mockPaginatedInactiveMembershipsResponse(),
          },
        },
      },
      ...errorResponseRefs,
    },
  }),
};
export default membershipRoutes;
