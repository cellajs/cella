import { createRoute, z } from '@hono/zod-openapi';

import { paginationQuerySchema } from '../../schemas/common';
import {
  errorResponses,
  successResponseWithDataSchema,
  successResponseWithPaginationSchema,
  successResponseWithoutDataSchema,
} from '../../schemas/responses';
import {
  apiOrganizationSchema,
  apiOrganizationUserSchema,
  createOrganizationJsonSchema,
  deleteOrganizationParamSchema,
  deleteUserFromOrganizationParamSchema,
  getOrganizationParamSchema,
  getUsersByOrganizationIdParamSchema,
  updateOrganizationJsonSchema,
  updateOrganizationParamSchema,
  updateUserInOrganizationJsonSchema,
  updateUserInOrganizationParamSchema,
} from './schema';

export const createOrganizationRoute = createRoute({
  method: 'post',
  path: '/organizations',
  tags: ['organizations'],
  summary: 'Create a new organization',
  description: `
    Permissions:
      - Users with role 'ADMIN'
  `,
  request: {
    body: {
      content: {
        'application/json': {
          schema: createOrganizationJsonSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Organization was created',
      content: {
        'application/json': {
          schema: successResponseWithDataSchema(apiOrganizationSchema),
        },
      },
    },
    ...errorResponses,
  },
});

export const updateOrganizationRoute = createRoute({
  method: 'put',
  path: '/organizations/{organizationIdentifier}',
  tags: ['organizations'],
  summary: 'Update organization',
  description: `
    Permissions:
      - Users with role 'ADMIN'
      - Users, who are members of the organization and have role 'ADMIN' in the organization
  `,
  request: {
    params: updateOrganizationParamSchema,
    body: {
      content: {
        'application/json': {
          schema: updateOrganizationJsonSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Organization was updated',
      content: {
        'application/json': {
          schema: successResponseWithDataSchema(apiOrganizationSchema),
        },
      },
    },
    ...errorResponses,
  },
});

export const deleteOrganizationRoute = createRoute({
  method: 'delete',
  path: '/organizations/{organizationIdentifier}',
  tags: ['organizations'],
  summary: 'Delete organization',
  description: `
    Permissions:
      - Users with role 'ADMIN'
  `,
  request: {
    params: deleteOrganizationParamSchema,
  },
  responses: {
    200: {
      description: 'Organization was deleted',
      content: {
        'application/json': {
          schema: successResponseWithoutDataSchema,
        },
      },
    },
    ...errorResponses,
  },
});

export const getOrganizationsRoute = createRoute({
  method: 'get',
  path: '/organizations',
  tags: ['organizations'],
  summary: 'Get organizations',
  description: `
    If user has role 'ADMIN', then he receives all organizations.
    If user has role 'USER', then he receives only organizations, where he is a member.
  `,
  request: {
    query: paginationQuerySchema.merge(
      z.object({
        sort: z
          .enum(['id', 'name', 'userRole', 'createdAt'])
          .optional()
          .default('id')
          .openapi({
            param: {
              description: 'Sort by',
            },
          }),
      }),
    ),
  },
  responses: {
    200: {
      description: 'Organizations',
      content: {
        'application/json': {
          schema: successResponseWithPaginationSchema(apiOrganizationSchema),
        },
      },
    },
    ...errorResponses,
  },
});

export const getOrganizationByIdOrSlugRoute = createRoute({
  method: 'get',
  path: '/organizations/{organizationIdentifier}',
  tags: ['organizations'],
  summary: 'Get organization by id or slug',
  description: `
    Permissions:
      - Users with role 'ADMIN'
      - Users, who are members of the organization
  `,
  request: {
    params: getOrganizationParamSchema,
  },
  responses: {
    200: {
      description: 'Organization',
      content: {
        'application/json': {
          schema: successResponseWithDataSchema(apiOrganizationSchema),
        },
      },
    },
    ...errorResponses,
  },
});

export const getUsersByOrganizationIdRoute = createRoute({
  method: 'get',
  path: '/organizations/{organizationIdentifier}/members',
  tags: ['organizations'],
  summary: 'Get members(users) of organization',
  description: `
    Permissions:
      - Users with role 'ADMIN'
      - Users, who are members of the organization
  `,
  request: {
    params: getUsersByOrganizationIdParamSchema,
    query: paginationQuerySchema.extend({
      sort: z
        .enum(['id', 'name', 'email', 'organizationRole', 'createdAt', 'lastSeenAt'])
        .optional()
        .default('id')
        .openapi({
          param: {
            description: 'Sort by',
          },
        }),
      role: z
        .enum(['admin', 'member'])
        .optional()
        .openapi({
          param: {
            description: 'Filter by role in organization (if not set, then all users are returned)',
          },
        }),
    }),
  },
  responses: {
    200: {
      description: 'Members of organization',
      content: {
        'application/json': {
          schema: successResponseWithPaginationSchema(apiOrganizationUserSchema),
        },
      },
    },
    ...errorResponses,
  },
});

export const updateUserInOrganizationRoute = createRoute({
  method: 'put',
  path: '/organizations/{organizationIdentifier}/members/{userId}',
  tags: ['organizations'],
  summary: 'Update member(user) in organization',
  description: `
    Permissions:
      - Users with role 'ADMIN'
      - Users, who are members of the organization and have role 'ADMIN' in the organization
  `,
  request: {
    params: updateUserInOrganizationParamSchema,
    body: {
      content: {
        'application/json': {
          schema: updateUserInOrganizationJsonSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Member was updated in organization',
      content: {
        'application/json': {
          schema: successResponseWithDataSchema(apiOrganizationUserSchema),
        },
      },
    },
    ...errorResponses,
  },
});

export const deleteUserFromOrganizationRoute = createRoute({
  method: 'delete',
  path: '/organizations/{organizationIdentifier}/members/{userId}',
  tags: ['organizations'],
  summary: 'Delete member(user) from organization',
  description: `
    Permissions:
      - Users with role 'ADMIN'
      - Users, who are members of the organization and have role 'ADMIN' in the organization
  `,
  request: {
    params: deleteUserFromOrganizationParamSchema,
  },
  responses: {
    200: {
      description: 'Member was deleted from organization',
      content: {
        'application/json': {
          schema: successResponseWithDataSchema(apiOrganizationUserSchema),
        },
      },
    },
    ...errorResponses,
  },
});
