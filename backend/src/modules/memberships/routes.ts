import { z } from '@hono/zod-openapi';

import { errorResponses, successResponseWithDataSchema } from '../../lib/common-responses';
import { createRouteConfig } from '../../lib/route-config';
import { anyTenantGuard, publicGuard } from '../../middlewares/guard';
import { deleteMembersQuerySchema, membershipUserParamSchema, updateMembershipJsonSchema } from './schema';
import { apiOrganizationUserSchema } from '../organizations/schema';

export const updateMembershipRouteConfig = createRouteConfig({
  method: 'put',
  path: '/memberships/{id}',
  guard: anyTenantGuard('id', ['ADMIN']),
  tags: ['memberships'],
  summary: 'Update role, muted, or archived status',
  description: `
    Permissions:
      - Users with role 'ADMIN'
  `,
  request: {
    params: membershipUserParamSchema,
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
          schema: successResponseWithDataSchema(apiOrganizationUserSchema),
        },
      },
    },
    ...errorResponses,
  },
});

export const deleteMembershipRouteConfig = createRouteConfig({
  method: 'delete',
  path: '/memberships',
  // TODO: Implement guard
  // guard: anyTenantGuard(['ADMIN']),
  guard: publicGuard,
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
