import { z } from '@hono/zod-openapi';

import {
  errorResponses,
  successResponseWithDataSchema,
  successResponseWithErrorsSchema,
  successResponseWithPaginationSchema,
} from '../../lib/common-responses';
import { deleteByIdsQuerySchema, organizationParamSchema } from '../../lib/common-schemas';
import { createRouteConfig } from '../../lib/route-config';
import { authGuard, systemGuard, tenantGuard } from '../../middlewares/guard';
import {
  apiOrganizationSchema,
  apiOrganizationUserSchema,
  createOrganizationJsonSchema,
  getOrganizationsQuerySchema,
  getUsersByOrganizationQuerySchema,
  organizationWithUserParamSchema,
  updateOrganizationJsonSchema,
  updateUserInOrganizationJsonSchema,
} from './schema';

export const createOrganizationRouteConfig = createRouteConfig({
  method: 'post',
  path: '/organizations',
  guard: authGuard(),
  tags: ['organizations'],
  summary: 'Create a new organization',
  // TODO: all users can create, but somehow we need to restrict it to just one and with more needing manual activation by an admin? 
  // description: `
  //   Permissions:
  //     - Users with role 'ADMIN'
  // `,
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

export const updateOrganizationRouteConfig = createRouteConfig({
  method: 'put',
  path: '/organizations/{organizationIdentifier}',
  guard: tenantGuard(['ADMIN']),
  tags: ['organizations'],
  summary: 'Update organization',
  description: `
    Permissions:
      - Users with role 'ADMIN'
      - Users, who are members of the organization and have role 'ADMIN' in the organization
  `,
  request: {
    params: organizationParamSchema,
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

export const deleteOrganizationsRouteConfig = createRouteConfig({
  method: 'delete',
  path: '/organizations',
  guard: systemGuard,
  tags: ['organizations'],
  summary: 'Delete organizations',
  description: `
    Permissions:
      - Users with role 'ADMIN'
  `,
  request: {
    query: deleteByIdsQuerySchema,
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

export const getOrganizationsRouteConfig = createRouteConfig({
  method: 'get',
  path: '/organizations',
  guard: systemGuard,
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

export const getOrganizationByIdOrSlugRouteConfig = createRouteConfig({
  method: 'get',
  path: '/organizations/{organizationIdentifier}',
  guard: tenantGuard(),
  tags: ['organizations'],
  summary: 'Get organization by id or slug',
  description: `
    Permissions:
      - Users with role 'ADMIN'
      - Users, who are members of the organization
  `,
  request: {
    params: organizationParamSchema,
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

export const getUsersByOrganizationIdRouteConfig = createRouteConfig({
  method: 'get',
  path: '/organizations/{organizationIdentifier}/members',
  guard: tenantGuard(),
  tags: ['organizations'],
  summary: 'Get members(users) of organization',
  description: `
    Permissions:
      - Users with role 'ADMIN'
      - Users, who are members of the organization
  `,
  request: {
    params: organizationParamSchema,
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

export const updateUserInOrganizationRouteConfig = createRouteConfig({
  method: 'put',
  path: '/organizations/{organizationIdentifier}/members/{userId}',
  guard: tenantGuard(['ADMIN']),
  tags: ['organizations'],
  summary: 'Update member(user) in organization',
  description: `
    Permissions:
      - Users with role 'ADMIN'
      - Users, who are members of the organization and have role 'ADMIN' in the organization
  `,
  request: {
    params: organizationWithUserParamSchema,
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

export const deleteUsersFromOrganizationRouteConfig = createRouteConfig({
  method: 'delete',
  path: '/organizations/{organizationIdentifier}/members',
  guard: tenantGuard(['ADMIN']),
  tags: ['organizations'],
  summary: 'Delete members(users) from organization',
  description: `
    Permissions:
      - Users with role 'ADMIN'
      - Users, who are members of the organization and have role 'ADMIN' in the organization
  `,
  request: {
    query: deleteByIdsQuerySchema,
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
