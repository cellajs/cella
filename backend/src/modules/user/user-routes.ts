import { z } from '@hono/zod-openapi';
import { createXRoutes, errors, json, xRoute } from '#/core/x-routes';
import { relatableGuard, userGuard } from '#/middlewares/guard';
import { systemRoleBaseSchema } from '#/modules/system/system-schema';
import { mockMemberUserResponse, mockPaginatedUsersResponse } from '#/modules/user/user-mocks';
import { memberUserSchema, userListQuerySchema } from '#/modules/user/user-schema';
import { paginationSchema, relatableUserIdParamSchema, slugIncludeQuerySchema } from '#/schemas';

const userRoutes = createXRoutes(['users', 'cella'], {
  getUsers: xRoute({
    method: 'get',
    path: '/users',
    xGuard: [userGuard],
    summary: 'Get list of users',
    description: 'Returns a list of users. Only system admins receive the system `role`, and only they may filter or sort by it.',
    request: { query: userListQuerySchema },
    responses: {
      200: json(
        'Users',
        paginationSchema(
          memberUserSchema.extend({
            // Absent for other callers: the field would list the system admins.
            role: systemRoleBaseSchema.shape.role.nullable().optional(),
          }),
        ),
        mockPaginatedUsersResponse(),
      ),
      ...errors(403),
    },
  }),
  getUser: xRoute({
    method: 'get',
    path: '/users/{relatableUserId}',
    xGuard: [userGuard, relatableGuard],
    summary: 'Get user',
    description:
      'Retrieves a user by ID. The requesting user must share at least one organization membership. Pass ?slug=true to resolve by slug instead. Pass ?include=mfa for `mfaRequired`, which only the user themselves, system admins and admins of an organization the user is a member of receive.',
    request: { params: relatableUserIdParamSchema, query: slugIncludeQuerySchema },
    responses: {
      200: json('User', memberUserSchema.extend({ mfaRequired: z.boolean().optional() }), mockMemberUserResponse()),
      ...errors(404),
    },
  }),
});

export { userRoutes };
