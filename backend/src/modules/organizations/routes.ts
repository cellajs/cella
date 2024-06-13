import {
  errorResponses,
  successResponseWithDataSchema,
  successResponseWithErrorsSchema,
  successResponseWithPaginationSchema,
} from '../../lib/common-responses';
import { deleteByIdsQuerySchema, entityParamSchema } from '../../lib/common-schemas';
import { createRouteConfig } from '../../lib/route-config';
import { isAllowedTo, isAuthenticated, isSystemAdmin, splitByAllowance } from '../../middlewares/guard';
import { apiOrganizationSchema, createOrganizationJsonSchema, getOrganizationsQuerySchema, updateOrganizationJsonSchema } from './schema';

class OrganizationRoutesConfig {
  public createOrganization = createRouteConfig({
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
        description: 'Organization was createRouteConfigd',
        content: {
          'application/json': {
            schema: successResponseWithDataSchema(apiOrganizationSchema),
          },
        },
      },
      ...errorResponses,
    },
  });

  public getOrganizations = createRouteConfig({
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

  public updateOrganization = createRouteConfig({
    method: 'put',
    path: '/{idOrSlug}',
    guard: [isAuthenticated, isAllowedTo('update', 'ORGANIZATION')],
    tags: ['organizations'],
    summary: 'Update organization',
    description: 'Update organization by id or slug.',
    request: {
      params: entityParamSchema,
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

  public getOrganization = createRouteConfig({
    method: 'get',
    path: '/{idOrSlug}',
    guard: [isAuthenticated, isAllowedTo('read', 'ORGANIZATION')],
    tags: ['organizations'],
    summary: 'Get organization',
    description: 'Get an organization by id or slug.',
    request: {
      params: entityParamSchema,
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

  public deleteOrganizations = createRouteConfig({
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
}
export default new OrganizationRoutesConfig();
