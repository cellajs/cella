import { z } from '@hono/zod-openapi';

import { createRouteConfig } from '#/lib/route-config';
import { hasOrgAccess, isAuthenticated } from '#/middlewares/guard';
import { idInOrgParamSchema, idOrSlugSchema, idsBodySchema, inOrgParamSchema } from '#/utils/schema/common';
import {
  errorResponses,
  successWithDataSchema,
  successWithErrorsSchema,
  successWithPaginationSchema,
  successWithoutDataSchema,
} from '#/utils/schema/responses';
import {
  baseMembersQuerySchema,
  createMembershipsBodySchema,
  invitedMembersQuerySchema,
  invitedMembersSchema,
  membersQuerySchema,
  membersSchema,
  membershipSchema,
  updateMembershipBodySchema,
} from './schema';

class MembershipRouteConfig {
  public createMemberships = createRouteConfig({
    method: 'post',
    path: '/',
    guard: [isAuthenticated, hasOrgAccess],
    tags: ['memberships'],
    summary: 'Invite members',
    description: 'Invite members to an entity such as an organization.',
    request: {
      query: baseMembersQuerySchema,
      params: inOrgParamSchema,
      body: {
        content: {
          'application/json': {
            schema: createMembershipsBodySchema,
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

  public deleteMemberships = createRouteConfig({
    method: 'delete',
    path: '/',
    guard: [isAuthenticated, hasOrgAccess],
    tags: ['memberships'],
    summary: 'Delete memberships',
    description: 'Delete memberships by their ids. This will remove the membership but not delete any user(s).',
    request: {
      params: inOrgParamSchema,
      query: baseMembersQuerySchema,
      body: {
        content: { 'application/json': { schema: idsBodySchema } },
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

  public updateMembership = createRouteConfig({
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
            schema: updateMembershipBodySchema,
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

  public getMembers = createRouteConfig({
    method: 'get',
    path: '/members',
    guard: [isAuthenticated, hasOrgAccess],
    tags: ['memberships'],
    summary: 'Get list of members',
    description: 'Get members of a context entity by id or slug. It returns members (users) with their membership.',
    request: {
      query: membersQuerySchema,
      params: z.object({ orgIdOrSlug: idOrSlugSchema.optional() }),
    },
    responses: {
      200: {
        description: 'Members',
        content: {
          'application/json': {
            schema: successWithPaginationSchema(membersSchema),
          },
        },
      },
      ...errorResponses,
    },
  });

  public getInvitedMembers = createRouteConfig({
    method: 'get',
    path: '/invited-members',
    guard: [isAuthenticated, hasOrgAccess],
    tags: ['memberships'],
    summary: 'Get list of invited members',
    description: 'Get invited members of a context entity by id or slug. It returns invite info.',
    request: {
      query: invitedMembersQuerySchema,
      params: inOrgParamSchema,
    },
    responses: {
      200: {
        description: 'Invited members',
        content: {
          'application/json': {
            schema: successWithPaginationSchema(invitedMembersSchema),
          },
        },
      },
      ...errorResponses,
    },
  });
}
export default new MembershipRouteConfig();
