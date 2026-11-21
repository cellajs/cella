import { z } from '@hono/zod-openapi';
import { createXRoutes, errors, json, xRoute } from '#/core/x-routes';
import { userGuard } from '#/middlewares/guard';
import { systemRoleBaseSchema } from '#/modules/system/system-schema';
import { mockMemberUserResponse, mockPaginatedUsersResponse } from '#/modules/user/user-mocks';
import { memberUserSchema, userListQuerySchema } from '#/modules/user/user-schema';
import { paginationSchema, slugIncludeQuerySchema, validIdOrSlugSchema } from '#/schemas';

export const userRoutes = createXRoutes(['users', 'cella'], {
  listUsers: xRoute({
    method: 'get',
    path: '/',
    xGuard: [userGuard],
    xAnonymous: true,
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
    path: '/{userId}',
    xGuard: [userGuard],
    xAnonymous: true,
    summary: 'Get user',
    description:
      "Retrieves a user by ID. The requesting user's roles must let it see the user, through one of the user's memberships. Pass ?slug=true to resolve by slug instead. Pass ?include=mfa for `mfaRequired`, which only the user themselves, system admins and admins of an organization the user is a member of receive.",
    request: { params: z.object({ userId: validIdOrSlugSchema }), query: slugIncludeQuerySchema },
    responses: {
      200: json('User', memberUserSchema.extend({ mfaRequired: z.boolean().optional() }), mockMemberUserResponse()),
      ...errors(403),
    },
  }),
});
