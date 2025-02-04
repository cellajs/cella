import { z } from '@hono/zod-openapi';

import { createRouteConfig } from '#/lib/route-config';
import { hasOrgAccess, isAuthenticated } from '#/middlewares/guard';
import {
  errorResponses,
  successWithDataSchema,
  successWithErrorsSchema,
  successWithPaginationSchema,
  successWithoutDataSchema,
} from '#/utils/schema/common-responses';
import { idOrSlugSchema, idSchema, idsBodySchema } from '#/utils/schema/common-schemas';
import { membersQuerySchema, membersSchema } from '../general/schema';
import { baseMembersQuerySchema, createMembershipsBodySchema, membershipSchema, updateMembershipBodySchema } from './schema';

class MembershipRoutesConfig {
  public createMemberships = createRouteConfig({
    method: 'post',
    path: '/',
    guard: [isAuthenticated, hasOrgAccess],
    tags: ['memberships'],
    summary: 'Invite members',
    description: 'Invite members to an entity such as an organization.',
    request: {
      query: baseMembersQuerySchema,
      params: z.object({ orgIdOrSlug: idOrSlugSchema }),
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
      params: z.object({ orgIdOrSlug: idOrSlugSchema }),
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
      params: z.object({ orgIdOrSlug: idOrSlugSchema, id: idSchema }),
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
      params: z.object({
        orgIdOrSlug: idOrSlugSchema.optional(),
      }),
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
}
export default new MembershipRoutesConfig();
