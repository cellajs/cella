import { z } from '@hono/zod-openapi';

import { errorResponses, successResponseWithDataSchema, successResponseWithoutDataSchema } from '../../lib/common-responses';
import { createRouteConfig } from '../../lib/route-config';
import { isAuthenticated } from '../../middlewares/guard';
import { apiMembershipSchema, deleteMembersQuerySchema, updateMembershipJsonSchema, updateMembershipParamSchema } from './schema';
import { inviteJsonSchema, inviteQuerySchema } from '../general/schema';

export const updateMembershipRouteConfig = createRouteConfig({
  method: 'put',
  path: '/memberships/{membership}',
  guard: isAuthenticated,
  tags: ['memberships'],
  summary: 'Update role, muted, or archived status',
  description: `
    Permissions:
      - Users role 'ADMIN'
  `,
  request: {
    params: updateMembershipParamSchema,
    body: {
      content: {
        'application/json': {
          schema: updateMembershipJsonSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Role, muted, or archived status was updated',
      content: {
        'application/json': {
          schema: successResponseWithDataSchema(apiMembershipSchema),
        },
      },
    },
    ...errorResponses,
  },
});

export const inviteMembershipRouteConfig = createRouteConfig({
  method: 'post',
  path: '/membership',
  guard: isAuthenticated,
  tags: ['memberships'],
  summary: 'Invite a new member(user) to organization',
  description: `
    Permissions:
      - Users with role 'ADMIN'
      - Users, who are members of the organization and have role 'ADMIN' in the organization
  `,
  request: {
    query: inviteQuerySchema,
    body: {
      content: {
        'application/json': {
          schema: inviteJsonSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Invitation was sent',
      content: {
        'application/json': {
          schema: successResponseWithoutDataSchema,
        },
      },
    },
    ...errorResponses,
  },
});

export const deleteMembershipsRouteConfig = createRouteConfig({
  method: 'delete',
  path: '/memberships',
  guard: isAuthenticated,
  tags: ['memberships'],
  summary: 'Delete memberships',
  description: `
    Permissions:
      - Users with role 'ADMIN'
      - Users, who are members of the organization and have role 'ADMIN' in the organization
  `,
  request: {
    query: deleteMembersQuerySchema,
  },
  responses: {
    200: {
      description: 'Success',
      content: {
        'application/json': {
          schema: successResponseWithDataSchema(z.object({ error: z.string().optional() }).optional()),
        },
      },
    },
    ...errorResponses,
  },
});
