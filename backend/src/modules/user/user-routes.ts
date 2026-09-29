import { createXRoute } from '#/core/x-routes';
import { crossTenantGuard, relatableGuard, userGuard } from '#/middlewares/guard';
import { systemRoleBaseSchema } from '#/modules/system/system-schema';
import { memberUserSchema, userListQuerySchema } from '#/modules/user/user-schema';
import { errorResponseRefs, paginationSchema, relatableUserIdParamSchema, slugQuerySchema } from '#/schemas';
import { mockPaginatedUsersResponse, mockUserResponse } from './user-mocks';

const userRoutes = {
  getUsers: createXRoute({
    operationId: 'getUsers',
    method: 'get',
    path: '/users',
    xGuard: [userGuard, crossTenantGuard],
    tags: ['users', 'cella'],
    summary: 'Get list of users',
    description:
      'Returns a list of users. Only system admins receive the system `role`, and only they may filter or sort by it.',
    request: { query: userListQuerySchema },
    responses: {
      200: {
        description: 'Users',
        content: {
          'application/json': {
            schema: paginationSchema(
              memberUserSchema.extend({
                // Absent for other callers: the field would list the system admins.
                role: systemRoleBaseSchema.shape.role.nullable().optional(),
              }),
            ),
            example: mockPaginatedUsersResponse(),
          },
        },
      },
      ...errorResponseRefs,
    },
  }),
  getUser: createXRoute({
    operationId: 'getUser',
    method: 'get',
    path: '/users/{relatableUserId}',
    xGuard: [userGuard, crossTenantGuard, relatableGuard],
    tags: ['users', 'cella'],
    summary: 'Get user',
    description:
      'Retrieves a user by ID. The requesting user must share at least one organization membership. Pass ?slug=true to resolve by slug instead.',
    request: { params: relatableUserIdParamSchema, query: slugQuerySchema },
    responses: {
      200: {
        description: 'User',
        content: { 'application/json': { schema: memberUserSchema, example: mockUserResponse() } },
      },
      ...errorResponseRefs,
    },
  }),
};

export { userRoutes };
