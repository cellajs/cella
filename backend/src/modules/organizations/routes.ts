import { z } from 'zod';
import { createRouteConfig } from '#/lib/route-config';
import { hasSystemAccess, isAuthenticated } from '#/middlewares/guard';
import { entityParamSchema, idsBodySchema } from '#/utils/schema/common';
import { errorResponses, successWithDataSchema, successWithErrorsSchema, successWithPaginationSchema } from '#/utils/schema/responses';
import {
  createOrganizationBodySchema,
  getOrganizationsQuerySchema,
  membershipsCountSchema,
  organizationSchema,
  organizationWithMembershipSchema,
  relatedEntitiesCountSchema,
  updateOrganizationBodySchema,
} from './schema';

class OrganizationRouteConfig {
  public createOrganization = createRouteConfig({
    method: 'post',
    path: '/',
    guard: isAuthenticated,
    tags: ['organizations'],
    summary: 'Create organization',
    description: 'Create a new organization.',
    request: {
      body: {
        required: true,
        content: {
          'application/json': {
            schema: createOrganizationBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Organization was created',
        content: {
          'application/json': {
            schema: successWithDataSchema(organizationWithMembershipSchema),
          },
        },
      },
      ...errorResponses,
    },
  });

  public getOrganizations = createRouteConfig({
    method: 'get',
    path: '/',
    guard: [isAuthenticated, hasSystemAccess],
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
            schema: successWithPaginationSchema(organizationSchema),
          },
        },
      },
      ...errorResponses,
    },
  });

  public updateOrganization = createRouteConfig({
    method: 'put',
    path: '/{idOrSlug}',
    guard: [isAuthenticated],
    tags: ['organizations'],
    summary: 'Update organization',
    description: 'Update organization by id or slug.',
    request: {
      params: entityParamSchema,
      body: {
        content: {
          'application/json': {
            schema: updateOrganizationBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Organization was updated',
        content: {
          'application/json': {
            schema: successWithDataSchema(organizationSchema),
          },
        },
      },
      ...errorResponses,
    },
  });

  public getOrganization = createRouteConfig({
    method: 'get',
    path: '/{idOrSlug}',
    guard: [isAuthenticated],
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
            schema: successWithDataSchema(
              organizationSchema.extend({ counts: z.object({ ...membershipsCountSchema.shape, ...relatedEntitiesCountSchema.shape }) }),
            ),
          },
        },
      },
      ...errorResponses,
    },
  });

  public deleteOrganizations = createRouteConfig({
    method: 'delete',
    path: '/',
    guard: [isAuthenticated],
    tags: ['organizations'],
    summary: 'Delete organizations',
    description: 'Delete organizations by ids.',
    request: {
      body: {
        content: { 'application/json': { schema: idsBodySchema() } },
      },
    },
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: successWithErrorsSchema(),
          },
        },
      },
      ...errorResponses,
    },
  });
}
export default new OrganizationRouteConfig();
