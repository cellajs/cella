import { createXRoute } from '#/docs/x-routes';
import { authGuard, tenantGuard } from '#/middlewares/guard';
import { membershipBaseSchema } from '#/modules/memberships/memberships-schema';
import { systemRoleBaseSchema } from '#/modules/system/system-schema';
import { userListQuerySchema, userSchema } from '#/modules/user/user-schema';
import { errorResponseRefs, idOrSlugInTenantOrgParamSchema, paginationSchema, tenantOrgParamSchema } from '#/schemas';
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
                role: systemRoleBaseSchema.shape.role.optional(),
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
   * Get a user by ID or slug
   */
  getUser: createXRoute({
    operationId: 'getUser',
    method: 'get',
    path: '/{idOrSlug}',
    xGuard: [authGuard, tenantGuard],
    tags: ['users'],
    summary: 'Get user',
    description: 'Retrieves a *user* by ID or slug in an organization context.',
    request: { params: idOrSlugInTenantOrgParamSchema },
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
