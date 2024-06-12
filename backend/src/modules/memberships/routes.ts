import { z } from '@hono/zod-openapi';

import { errorResponses, successResponseWithDataSchema, successResponseWithErrorsSchema, successResponseWithoutDataSchema } from '../../lib/common-responses';
import { idSchema } from '../../lib/common-schemas';
import { createRouteConfig } from '../../lib/route-config';
import { isAuthenticated } from '../../middlewares/guard';
import { inviteJsonSchema } from '../general/schema';
import { apiMembershipSchema, createMembershipQuerySchema, deleteMembersQuerySchema, updateMembershipJsonSchema } from './schema';

export const createMembershipRouteConfig = createRouteConfig({
  method: 'post',
  path: '/',
  guard: isAuthenticated,
  tags: ['memberships'],
  summary: 'Invite members',
  description: 'Invite members to an entity such as an organization.',
  request: {
    query: createMembershipQuerySchema,
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
          schema: successResponseWithErrorsSchema(),
        },
      },
    },
    ...errorResponses,
  },
});

export const updateMembershipRouteConfig = createRouteConfig({
  method: 'put',
  path: '/{id}',
  guard: isAuthenticated,
  tags: ['memberships'],
  summary: 'Update membership',
  description: 'Update role, muted, or archived status in a membership.',
  request: {
    params: z.object({ id: idSchema }),
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
