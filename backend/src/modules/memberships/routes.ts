import { z } from '@hono/zod-openapi';

import { errorResponses, successResponseWithDataSchema } from '../../lib/common-responses';
import { createRouteConfig } from '../../lib/route-config';
import { anyTenantGuard } from '../../middlewares/guard';
import { deleteMembersParamSchema, deleteMembersQuerySchema, updateMembershipJsonSchema, updateMembershipParamSchema } from './schema';
import { apiOrganizationUserSchema } from '../organizations/schema';

export const updateMembershipRouteConfig = createRouteConfig({
  method: 'put',
  path: '/{idOrSlug}/memberships/{user}',
  guard: anyTenantGuard('idOrSlug'),
  tags: ['memberships'],
  summary: 'Update role, muted, or archived status',
  description: `
    Permissions:
      - Users with role 'ADMIN'
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
          schema: successResponseWithDataSchema(apiOrganizationUserSchema),
        },
      },
    },
    ...errorResponses,
  },
});

export const deleteMembershipsRouteConfig = createRouteConfig({
  method: 'delete',
  path: '/{idOrSlug}/memberships',
  guard: anyTenantGuard('idOrSlug'),
  tags: ['memberships'],
  summary: 'Delete memberships',
  description: `
    Permissions:
      - Users with role 'ADMIN'
      - Users, who are members of the organization and have role 'ADMIN' in the organization
  `,
  request: {
    params: deleteMembersParamSchema,
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
