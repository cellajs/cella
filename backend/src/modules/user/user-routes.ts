import { createXRoute } from '#/docs/x-routes';
import { authGuard, tenantGuard } from '#/middlewares/guard';
import { membershipBaseSchema } from '#/modules/memberships/memberships-schema';
import { systemRoleBaseSchema } from '#/modules/system/system-schema';
import { userListQuerySchema, userSchema } from '#/modules/user/user-schema';
import {
  errorResponseRefs,
  paginationSchema,
  slugQuerySchema,
  tenantOrgParamSchema,
  userIdInTenantOrgParamSchema,
} from '#/schemas';
import { mockPaginatedUsersResponse, mockUserResponse } from '../../../mocks/mock-user';

const userRoutes = {
  /**
   * Get list of users
   */
  getUsers: createXRoute({
    operationId: 'getUsers',
    method: 'get',
    path: '/',
    xGuard: [authGuard, tenantGuard],
    tags: ['users'],
    summary: 'Get list of users',
    description: 'Returns a list of *users* in an organization context.',
    request: { params: tenantOrgParamSchema, query: userListQuerySchema },
    responses: {
      200: {
        description: 'Users',
        content: {
          'application/json': {
            schema: paginationSchema(
              userSchema.extend({
                memberships: membershipBaseSchema.array(),
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
   * Get a user by ID. Pass ?slug=true to resolve by slug.
   */
  getUser: createXRoute({
    operationId: 'getUser',
    method: 'get',
    path: '/{userId}',
    xGuard: [authGuard, tenantGuard],
    tags: ['users'],
    summary: 'Get user',
    description: 'Retrieves a *user* by ID in an organization context. Pass `?slug=true` to resolve by slug instead.',
    request: { params: userIdInTenantOrgParamSchema, query: slugQuerySchema },
    responses: {
      200: {
        description: 'User',
        content: { 'application/json': { schema: userSchema, example: mockUserResponse() } },
      },
      ...errorResponseRefs,
    },
  }),
};
export default userRoutes;
