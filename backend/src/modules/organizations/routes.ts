import { createRoute, z } from '@hono/zod-openapi';

import {
  errorResponses,
  successResponseWithDataSchema,
  successResponseWithErrorsSchema,
  successResponseWithPaginationSchema,
} from '../../lib/common-responses';
import {
  apiOrganizationSchema,
  apiOrganizationUserSchema,
  createOrganizationJsonSchema,
  getOrganizationParamSchema,
  getOrganizationsQuerySchema,
  getUsersByOrganizationIdParamSchema,
  getUsersByOrganizationQuerySchema,
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
      required: true,
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

export const deleteOrganizationsRoute = createRoute({
  method: 'delete',
  path: '/organizations',
  tags: ['organizations'],
  summary: 'Delete organizations',
  description: `
    Permissions:
      - Users with role 'ADMIN'
  `,
  request: {
    query: z.object({
      ids: z.union([z.string(), z.array(z.string())]),
    }),
  },
  responses: {
    200: {
      description: 'Success',
      content: {
        'application/json': {
          schema: successResponseWithErrorsSchema(),
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
    query: getOrganizationsQuerySchema,
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
    query: getUsersByOrganizationQuerySchema,
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

export const deleteUsersFromOrganizationRoute = createRoute({
  method: 'delete',
  path: '/organizations/{organizationIdentifier}/members',
  tags: ['organizations'],
  summary: 'Delete members(users) from organization',
  description: `
    Permissions:
      - Users with role 'ADMIN'
      - Users, who are members of the organization and have role 'ADMIN' in the organization
  `,
  request: {
    query: z.object({
      ids: z.union([z.string(), z.array(z.string())]),
    }),
  },
  responses: {
    200: {
      description: 'Success',
      content: {
        'application/json': {
          schema: successResponseWithDataSchema(z.object({ error: z.string().optional() }).optional()),
        },
      },
    },
    ...errorResponses,
  },
});
