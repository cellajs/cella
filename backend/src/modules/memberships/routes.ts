import { z } from '@hono/zod-openapi';

import { errorResponses, successWithDataSchema, successWithErrorsSchema, successWithoutDataSchema } from '../../lib/common-responses';
import { idSchema } from '../../lib/common-schemas';
import { createRouteConfig } from '../../lib/route-config';
import { isAuthenticated } from '../../middlewares/guard';
import {
  membershipSchema,
  createMembershipBodySchema,
  createMembershipQuerySchema,
  deleteMembersQuerySchema,
  updateMembershipBodySchema,
} from './schema';

class MembershipRoutesConfig {
  public createMembership = createRouteConfig({
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
            schema: createMembershipBodySchema,
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
    guard: isAuthenticated,
    tags: ['memberships'],
    summary: 'Update membership',
    description: 'Update role, muted, or archived status in a membership.',
    request: {
      params: z.object({ id: idSchema }),
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
}
export default new MembershipRoutesConfig();
