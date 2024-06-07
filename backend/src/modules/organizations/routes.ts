import {
  errorResponses,
  successResponseWithDataSchema,
  successResponseWithErrorsSchema,
  successResponseWithPaginationSchema,
} from '../../lib/common-responses';
import { deleteByIdsQuerySchema, organizationParamSchema } from '../../lib/common-schemas';
import { createRouteConfig } from '../../lib/route-config';
import { isAllowedTo, isAuthenticated, isSystemAdmin, splitByAllowance } from '../../middlewares/guard';
import { apiOrganizationSchema, createOrganizationJsonSchema, getOrganizationsQuerySchema, updateOrganizationJsonSchema } from './schema';

export const createOrganizationRouteConfig = createRouteConfig({
  method: 'post',
  path: '/',
  guard: isAuthenticated,
  tags: ['organizations'],
  summary: 'Create new organization',
  description: 'Create a new organization.',
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

export const getOrganizationsRouteConfig = createRouteConfig({
  method: 'get',
  path: '/',
  guard: [isAuthenticated, isSystemAdmin],
  tags: ['organizations'],
  summary: 'Get list of organizations',
  description: 'Get list of organizations. Currently only available to system admins.',
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

export const updateOrganizationRouteConfig = createRouteConfig({
  method: 'put',
  path: '/{organization}',
  guard: [isAuthenticated, isAllowedTo('update', 'organization')],
  tags: ['organizations'],
  summary: 'Update organization',
  description: 'Update organization by id or slug.',
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

export const getOrganizationRouteConfig = createRouteConfig({
  method: 'get',
  path: '/{organization}',
  guard: [isAuthenticated, isAllowedTo('read', 'organization')],
  tags: ['organizations'],
  summary: 'Get organization',
  description: 'Get an organization by id or slug.',
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

export const deleteOrganizationsRouteConfig = createRouteConfig({
  method: 'delete',
  path: '/',
  guard: [isAuthenticated, splitByAllowance('delete', 'organization')],
  tags: ['organizations'],
  summary: 'Delete organizations',
  description: 'Delete organizations by ids.',
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
