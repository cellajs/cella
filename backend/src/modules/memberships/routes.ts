import { z } from '@hono/zod-openapi';

import { errorResponses, successResponseWithDataSchema, successResponseWithoutDataSchema } from '../../lib/common-responses';
import { createRouteConfig } from '../../lib/route-config';
import { isAuthenticated } from '../../middlewares/guard';
import { inviteJsonSchema, inviteQuerySchema } from '../general/schema';
import { apiMembershipSchema, deleteMembersQuerySchema, updateMembershipJsonSchema, updateMembershipParamSchema } from './schema';

export const inviteMembershipRouteConfig = createRouteConfig({
  method: 'post',
  path: '/',
  guard: isAuthenticated,
  tags: ['memberships'],
  summary: 'Invite members',
  description: 'Invite members to an entity such as an organization.',
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
  path: '/',
  guard: isAuthenticated,
  tags: ['memberships'],
  summary: 'Delete memberships',
  description: 'Delete memberships by their ids. This will remove the membership but not delete any user(s).',
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

export const updateMembershipRouteConfig = createRouteConfig({
  method: 'put',
  path: '/{membership}',
  guard: isAuthenticated,
  tags: ['memberships'],
  summary: 'Update membership',
  description: 'Update role, muted, or archived status in a membership.',
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
      description: 'Membership updated',
      content: {
        'application/json': {
          schema: successResponseWithDataSchema(apiMembershipSchema),
        },
      },
    },
    ...errorResponses,
  },
});
