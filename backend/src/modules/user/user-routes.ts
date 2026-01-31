import { createXRoute } from '#/docs/x-routes';
import { hasSystemAccess, isAuthenticated } from '#/middlewares/guard';
import { membershipBaseSchema } from '#/modules/memberships/memberships-schema';
import { systemRoleBaseSchema } from '#/modules/system/system-schema';
import { userListQuerySchema, userSchema, userUpdateBodySchema } from '#/modules/user/user-schema';
import {
  entityParamSchema,
  errorResponseRefs,
  idsBodySchema,
  paginationSchema,
  successWithRejectedItemsSchema,
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
    xGuard: isAuthenticated,
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
   * Delete users
   */
  deleteUsers: createXRoute({
    operationId: 'deleteUsers',
    method: 'delete',
    path: '/',
    xGuard: [isAuthenticated, hasSystemAccess],
    tags: ['users'],
    summary: 'Delete users',
    description:
      "Deletes one or more *users* from the system based on a list of IDs. This also removes the user's memberships (cascade) and sets references to the user to `null` where applicable.",
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: idsBodySchema() } },
      },
    },
    responses: {
      200: {
        description: 'Success',
        content: { 'application/json': { schema: successWithRejectedItemsSchema } },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Get a user
   */
  getUser: createXRoute({
    operationId: 'getUser',
    method: 'get',
    path: '/{idOrSlug}',
    xGuard: isAuthenticated,
    tags: ['users'],
    summary: 'Get user',
    description: 'Retrieves a *user* by ID or slug.',
    request: { params: entityParamSchema },
    responses: {
      200: {
        description: 'User',
        content: { 'application/json': { schema: userSchema, example: mockUserResponse() } },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Update a user
   */
  updateUser: createXRoute({
    operationId: 'updateUser',
    method: 'put',
    path: '/{idOrSlug}',
    xGuard: [isAuthenticated, hasSystemAccess],
    tags: ['users'],
    summary: 'Update user',
    description: 'Updates a *user* identified by ID or slug.',
    request: {
      params: entityParamSchema,
      body: {
        content: { 'application/json': { schema: userUpdateBodySchema } },
      },
    },
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
