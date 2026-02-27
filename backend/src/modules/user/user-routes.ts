import { createXRoute } from '#/docs/x-routes';
import { authGuard, crossTenantGuard, relatableGuard } from '#/middlewares/guard';
import { systemRoleBaseSchema } from '#/modules/system/system-schema';
import { memberUserSchema, userListQuerySchema } from '#/modules/user/user-schema';
import { errorResponseRefs, paginationSchema, relatableUserIdParamSchema, slugQuerySchema } from '#/schemas';
import { mockPaginatedUsersResponse, mockUserResponse } from '../../../mocks/mock-user';

const userRoutes = {
  /**
   * Get list of users (cross-tenant)
   */
  getUsers: createXRoute({
    operationId: 'getUsers',
    method: 'get',
    path: '/users',
    xGuard: [authGuard, crossTenantGuard],
    tags: ['users'],
    summary: 'Get list of users',
    description: 'Returns a list of *users*.',
    request: { query: userListQuerySchema },
    responses: {
      200: {
        description: 'Users',
        content: {
          'application/json': {
            schema: paginationSchema(
              memberUserSchema.extend({
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
  /**
   * Get a user by ID (cross-tenant). Pass ?slug=true to resolve by slug.
   */
  getUser: createXRoute({
    operationId: 'getUser',
    method: 'get',
    path: '/users/{relatableUserId}',
    xGuard: [authGuard, crossTenantGuard, relatableGuard],
    tags: ['users'],
    summary: 'Get user',
    description:
      'Retrieves a *user* by ID. The requesting user must share at least one organization membership. Pass `?slug=true` to resolve by slug instead.',
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
export default userRoutes;
