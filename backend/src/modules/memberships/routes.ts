import { z } from '@hono/zod-openapi';

import { createCustomRoute } from '#/lib/custom-routes';
import { hasOrgAccess, isAuthenticated } from '#/middlewares/guard';
import { entityWithTypeQuerySchema, idInOrgParamSchema, idOrSlugSchema, idsBodySchema, inOrgParamSchema } from '#/utils/schema/common';
import {
  errorResponses,
  successWithDataSchema,
  successWithErrorsSchema,
  successWithPaginationSchema,
  successWithoutDataSchema,
} from '#/utils/schema/responses';
import { memberSchema } from '../users/schema';
import {
  memberListQuerySchema,
  membershipCreateBodySchema,
  membershipSchema,
  membershipUpdateBodySchema,
  pendingInvitationListQuerySchema,
  pendingInvitationSchema,
} from './schema';

class MembershipRoutes {
  public createMemberships = createCustomRoute({
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
        content: {
          'application/json': {
            schema: successWithoutDataSchema,
          },
        },
      },
      ...errorResponses,
    },
  });

  public deleteMemberships = createCustomRoute({
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
  });

  public updateMembership = createCustomRoute({
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
        content: {
          'application/json': {
            schema: successWithDataSchema(membershipSchema),
          },
        },
      },
      ...errorResponses,
    },
  });

  public getMembers = createCustomRoute({
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
            schema: successWithPaginationSchema(memberSchema),
          },
        },
      },
      ...errorResponses,
    },
  });

  public getPendingInvitations = createCustomRoute({
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
            schema: successWithPaginationSchema(pendingInvitationSchema),
          },
        },
      },
      ...errorResponses,
    },
  });
}
export default new MembershipRoutes();
