import { createXRoutes, json, xRoute } from '#/core/x-routes';
import { crossTenantGuard, relatableGuard, userGuard } from '#/middlewares/guard';
import { systemRoleBaseSchema } from '#/modules/system/system-schema';
import { memberUserSchema, userListQuerySchema } from '#/modules/user/user-schema';
import { paginationSchema, relatableUserIdParamSchema, slugQuerySchema } from '#/schemas';
import { mockPaginatedUsersResponse, mockUserResponse } from './user-mocks';

const userRoutes = createXRoutes(['users', 'cella'], {
  getUsers: xRoute({
    method: 'get',
    path: '/users',
    xGuard: [userGuard, crossTenantGuard],
    summary: 'Get list of users',
    description:
      'Returns a list of users. Only system admins receive the system `role`, and only they may filter or sort by it.',
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
    },
  }),
  getUser: xRoute({
    method: 'get',
    path: '/users/{relatableUserId}',
    xGuard: [userGuard, crossTenantGuard, relatableGuard],
    summary: 'Get user',
    description:
      'Retrieves a user by ID. The requesting user must share at least one organization membership. Pass ?slug=true to resolve by slug instead.',
    request: { params: relatableUserIdParamSchema, query: slugQuerySchema },
    responses: { 200: json('User', memberUserSchema, mockUserResponse()) },
  }),
});

export { userRoutes };
